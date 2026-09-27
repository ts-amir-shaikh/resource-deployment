import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accountEvents, passwordLinks, resources, users } from '@/lib/schema';
import { hashPassword, newSalt } from '@/lib/auth';
import { canSignIn } from './eligibility';
import { changedFields, checkAccount, needsNewSession, type AccountDraft, type AccountRecord } from './policy';
import { logEvent } from './service';

/**
 * The People screen's reads and writes (R1–R6, R19, R20). Every write goes
 * through lib/accounts/policy.ts and leaves an entry in the account log.
 */

const RECORD_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  role: users.role,
  isTeamLead: users.isTeamLead,
  interviewerDuty: users.interviewerDuty,
  accessUntil: users.accessUntil,
  resourceId: users.resourceId,
  active: users.active,
};

async function allRecords(): Promise<AccountRecord[]> {
  return db.select(RECORD_COLUMNS).from(users).all();
}

export type PersonRow = AccountRecord & {
  /** Shown only for older accounts that still sign in by username. */
  username: string | null;
  resourceName: string | null;
  hasPassword: boolean;
  lastSignInAt: string | null;
  canSignInNow: boolean;
  /** When the newest unused link runs out, if one is outstanding. */
  linkExpiresAt: string | null;
};

export async function listPeople(): Promise<PersonRow[]> {
  const now = new Date();
  const [rows, links] = await Promise.all([
    db
      .select({
        ...RECORD_COLUMNS,
        username: users.username,
        resourceName: resources.name,
        hasPassword: users.hasPassword,
        lastSignInAt: users.lastSignInAt,
      })
      .from(users)
      .leftJoin(resources, eq(resources.id, users.resourceId))
      .orderBy(users.name)
      .all(),
    db
      .select({ userId: passwordLinks.userId, expiresAt: sql<string>`max(${passwordLinks.expiresAt})` })
      .from(passwordLinks)
      .where(
        and(
          isNull(passwordLinks.usedAt),
          isNull(passwordLinks.cancelledAt),
          gt(passwordLinks.expiresAt, now.toISOString()),
        ),
      )
      .groupBy(passwordLinks.userId)
      .all(),
  ]);
  return rows.map((r) => ({
    ...r,
    username: r.email ? null : r.username,
    canSignInNow: canSignIn(r, now),
    linkExpiresAt: links.find((l) => l.userId === r.id)?.expiresAt ?? null,
  }));
}

/**
 * The username column predates email and is still NOT NULL and unique, so a
 * new account gets one derived from its address. Nobody signs in with it: an
 * account with an email answers only to the email (R14).
 */
async function freeUsername(email: string): Promise<string> {
  const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'user';
  const taken = new Set(
    (await db.select({ u: users.username }).from(users).all()).map((r) => r.u.toLowerCase()),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

async function resourceExists(id: number | null) {
  if (!id) return true;
  return Boolean(await db.select({ id: resources.id }).from(resources).where(eq(resources.id, id)).get());
}

export type SaveResult =
  | { ok: true; id: number }
  | { ok: false; message: string; fields: Record<string, string>; status: number };

export async function createPerson(input: AccountDraft, actorId: number): Promise<SaveResult> {
  const checked = checkAccount({ input: { ...input, active: true }, current: null, actorId, accounts: await allRecords() });
  if (!checked.ok) return { ...checked, status: 422 };
  const v = checked.value;
  if (!(await resourceExists(v.resourceId))) {
    return { ok: false, message: 'That resource no longer exists', fields: { resourceId: 'Pick again' }, status: 422 };
  }

  // No password until the person sets one through a link or uses Google. The
  // stored hash is of a random value nobody holds, and has-password is false,
  // so password sign-in refuses the account outright rather than relying on
  // the hash being unguessable.
  const salt = newSalt();
  const row = await db
    .insert(users)
    .values({
      ...v,
      email: v.email!,
      username: await freeUsername(v.email!),
      passwordSalt: salt,
      passwordHash: await hashPassword(randomBytes(32).toString('base64url'), salt),
      hasPassword: false,
    })
    .returning({ id: users.id })
    .get();

  await logEvent({ kind: 'account_created', subjectUserId: row.id, actorUserId: actorId, detail: { after: v } });
  return { ok: true, id: row.id };
}

export async function updatePerson(id: number, input: AccountDraft, actorId: number): Promise<SaveResult> {
  const accounts = await allRecords();
  const current = accounts.find((a) => a.id === id);
  if (!current) return { ok: false, message: 'Account not found', fields: {}, status: 404 };

  const checked = checkAccount({ input, current, actorId, accounts });
  if (!checked.ok) return { ...checked, status: 422 };
  const v = checked.value;
  if (v.resourceId !== current.resourceId && !(await resourceExists(v.resourceId))) {
    return { ok: false, message: 'That resource no longer exists', fields: { resourceId: 'Pick again' }, status: 422 };
  }

  const changes = changedFields(current, v);
  const activeChanged = current.active !== v.active;
  if (!Object.keys(changes).length && !activeChanged) return { ok: true, id };

  await db
    .update(users)
    .set({
      ...v,
      ...(needsNewSession(current, v) ? { sessionVersion: sql`${users.sessionVersion} + 1` } : {}),
    })
    .where(eq(users.id, id))
    .run();

  if (Object.keys(changes).length) {
    await logEvent({ kind: 'account_updated', subjectUserId: id, actorUserId: actorId, detail: { changes } });
  }
  if (activeChanged) {
    await logEvent({
      kind: v.active ? 'account_reactivated' : 'account_deactivated',
      subjectUserId: id,
      actorUserId: actorId,
    });
  }
  return { ok: true, id };
}

export async function personEvents(id: number) {
  const actor = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .as('actor');
  return db
    .select({
      id: accountEvents.id,
      kind: accountEvents.kind,
      method: accountEvents.method,
      attemptedIdentifier: accountEvents.attemptedIdentifier,
      detail: accountEvents.detail,
      createdAt: accountEvents.createdAt,
      actorName: actor.name,
    })
    .from(accountEvents)
    .leftJoin(actor, eq(actor.id, accountEvents.actorUserId))
    .where(eq(accountEvents.subjectUserId, id))
    .orderBy(desc(accountEvents.id))
    .limit(200)
    .all();
}
