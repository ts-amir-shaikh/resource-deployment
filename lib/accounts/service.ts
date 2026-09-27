import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accountEvents, passwordLinks, users, ACCOUNT_EVENT_KINDS } from '@/lib/schema';
import { createSession, hashPassword, newSalt, verifyPassword, type Session } from '@/lib/auth';
import { sendMail } from '@/lib/mail';
import { passwordLinkEmail } from '@/lib/mail-templates';
import { canSignIn, revocationStamp } from './eligibility';
import { isUsableEmail } from './identity';
import { expiryFrom, generateToken, hashToken, linkStatus, setPasswordUrl } from './links';

/** Matches the command-line tool (R11). */
export const MIN_PASSWORD_LENGTH = 10;

type EventKind = (typeof ACCOUNT_EVENT_KINDS)[number];

/** One row in the account log (R19). Never throws into the caller's flow. */
export async function logEvent(e: {
  kind: EventKind;
  subjectUserId?: number | null;
  actorUserId?: number | null;
  method?: 'google' | 'password' | null;
  attemptedIdentifier?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db
      .insert(accountEvents)
      .values({
        kind: e.kind,
        subjectUserId: e.subjectUserId ?? null,
        actorUserId: e.actorUserId || null,
        method: e.method ?? null,
        attemptedIdentifier: e.attemptedIdentifier ?? null,
        detail: JSON.stringify(e.detail ?? {}),
      })
      .run();
  } catch (err) {
    console.error('[account-log]', err);
  }
}

/**
 * The public address links point at. APP_BASE_URL wins so a link sent from a
 * preview or an internal hop still points at the real site; otherwise the
 * address the request arrived on.
 */
export function appOrigin(req: Request): string {
  const configured = (process.env.APP_BASE_URL || '').trim();
  return configured || new URL(req.url).origin;
}

export type SendLinkResult = { ok: true; to: string } | { ok: false; reason: string; status: number };

/**
 * Send link (R7, R8, R17, R18). A new link cancels every earlier unused one
 * for the account. The link row exists before the email goes out, and is
 * cancelled again if sending fails — so a failure never leaves a usable link
 * behind that nobody received.
 */
export async function sendPasswordLink(userId: number, actorUserId: number, origin: string): Promise<SendLinkResult> {
  const account = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!account) return { ok: false, reason: 'Account not found.', status: 404 };
  if (!account.email || !isUsableEmail(account.email)) {
    return { ok: false, reason: 'Add a real email address to this account before sending a link.', status: 422 };
  }
  if (!canSignIn(account)) {
    return { ok: false, reason: 'This account is deactivated or past its access-until date.', status: 409 };
  }

  const now = new Date();
  await db
    .update(passwordLinks)
    .set({ cancelledAt: now.toISOString() })
    .where(and(eq(passwordLinks.userId, userId), isNull(passwordLinks.usedAt), isNull(passwordLinks.cancelledAt)))
    .run();

  const token = generateToken();
  const link = await db
    .insert(passwordLinks)
    .values({ userId, tokenHash: hashToken(token), expiresAt: expiryFrom(now), createdByUserId: actorUserId || null })
    .returning({ id: passwordLinks.id })
    .get();

  const message = passwordLinkEmail({
    name: account.name,
    setPasswordUrl: setPasswordUrl(origin, token),
    signInUrl: `${origin.replace(/\/+$/, '')}/login`,
    kind: account.hasPassword ? 'reset' : 'invite',
  });
  const sent = await sendMail(account.email, message);

  if (!sent.ok) {
    await db.update(passwordLinks).set({ cancelledAt: new Date().toISOString() }).where(eq(passwordLinks.id, link.id)).run();
    await logEvent({ kind: 'link_failed', subjectUserId: userId, actorUserId, detail: { reason: sent.reason } });
    return { ok: false, reason: sent.reason, status: 502 };
  }

  await logEvent({ kind: 'link_sent', subjectUserId: userId, actorUserId, detail: { to: account.email } });
  return { ok: true, to: account.email };
}

async function storePassword(userId: number, password: string) {
  const salt = newSalt();
  const hash = await hashPassword(password, salt);
  // Stamping the revocation signs every existing session out (R21). The
  // caller re-issues this device's session when it should stay signed in; its
  // new token is issued no earlier than the stamp, so it survives.
  const row = await db
    .update(users)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      hasPassword: true,
      sessionsRevokedAt: revocationStamp(),
    })
    .where(eq(users.id, userId))
    .returning({ sessionVersion: users.sessionVersion, name: users.name, role: users.role })
    .get();
  return row;
}

export type ConsumeResult = { ok: true } | { ok: false; reason: string };

/** Setting a password from an emailed link (R7, R8, R11, R17). */
export async function consumeLink(token: string, password: string): Promise<ConsumeResult> {
  const generic = 'This link is no longer valid. Ask Admin to send a new one.';
  if (!token) return { ok: false, reason: generic };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }

  const link = await db.select().from(passwordLinks).where(eq(passwordLinks.tokenHash, hashToken(token))).get();
  if (!link || linkStatus(link) !== 'valid') return { ok: false, reason: generic };

  const account = await db.select().from(users).where(eq(users.id, link.userId)).get();
  if (!account || !canSignIn(account)) return { ok: false, reason: generic };

  // Mark used first and only if still unused, so two tabs racing the same link
  // cannot both set a password.
  const claimed = await db
    .update(passwordLinks)
    .set({ usedAt: new Date().toISOString() })
    .where(and(eq(passwordLinks.id, link.id), isNull(passwordLinks.usedAt), isNull(passwordLinks.cancelledAt)))
    .returning({ id: passwordLinks.id })
    .get();
  if (!claimed) return { ok: false, reason: generic };

  await storePassword(account.id, password);
  await logEvent({ kind: 'password_set', subjectUserId: account.id, actorUserId: account.id, method: 'password' });
  return { ok: true };
}

export type ChangeResult =
  | { ok: true; sessionVersion: number; name: string; role: (typeof users.$inferSelect)['role'] }
  | { ok: false; reason: string; status: number };

/** Changing your own password while signed in (R10, R11, R21). */
export async function changeOwnPassword(userId: number, current: string, next: string): Promise<ChangeResult> {
  const account = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!account) return { ok: false, reason: 'Account not found.', status: 404 };
  if (!account.hasPassword) {
    return { ok: false, reason: 'This account signs in with Google and has no password to change.', status: 409 };
  }
  if (!(await verifyPassword(current, account.passwordSalt, account.passwordHash))) {
    await new Promise((r) => setTimeout(r, 400));
    return { ok: false, reason: 'Your current password is not right.', status: 403 };
  }
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.`, status: 422 };
  }
  const row = await storePassword(userId, next);
  await logEvent({ kind: 'password_changed', subjectUserId: userId, actorUserId: userId, method: 'password' });
  return { ok: true, sessionVersion: row.sessionVersion, name: row.name, role: row.role };
}

/**
 * The last step of every successful sign-in, whichever way in (R12, R19):
 * record it and issue the session at the account's current version.
 */
export async function completeSignIn(
  account: Pick<typeof users.$inferSelect, 'id' | 'name' | 'role' | 'sessionVersion'>,
  method: 'google' | 'password',
): Promise<{ token: string; session: Session }> {
  await db.update(users).set({ lastSignInAt: new Date().toISOString() }).where(eq(users.id, account.id)).run();
  await logEvent({ kind: 'sign_in', subjectUserId: account.id, actorUserId: account.id, method });
  const session: Session = { uid: account.id, name: account.name, role: account.role, sv: account.sessionVersion };
  return { token: await createSession(session), session };
}
