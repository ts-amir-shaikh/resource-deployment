import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, sql } from 'drizzle-orm';
import { PATH_HEADER, SESSION_COOKIE, SIGNED_IN_HEADER, verifySession, type Role, type Session } from './auth';
import { db } from './db';
import { users } from './schema';
import { checkSession, type Verdict } from './accounts/eligibility';

/**
 * Reads the current user inside server components and route handlers.
 *
 * Verifies the signed cookie directly rather than trusting a header forwarded
 * by middleware — the signature is the thing that can't be forged, and this
 * stays correct even on the routes middleware waves through.
 *
 * The signature alone is not enough any more: it says who someone was when
 * they signed in, not whether they may still be here. So every read also
 * checks the account row (lib/accounts/eligibility.ts) — deactivation, a role
 * change, a passed access-until date or a password change elsewhere all take
 * effect on the next request. That check cannot run in the Edge middleware,
 * because the AWS host keeps the database as a SQLite file Edge code cannot
 * open; it runs here, and in `handle()` for API routes.
 */

export type SessionState =
  | { verdict: 'none'; session: null }
  | { verdict: Verdict; session: Session };

export { SIGNED_IN_HEADER, PATH_HEADER };

/**
 * One account lookup per request, however many components ask. `cache` only
 * memoises inside a React render; a route handler simply calls through, and
 * each one checks once anyway.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!session) return { verdict: 'none', session: null };

  // The legacy shared-password account has no row. It is valid only while no
  // account exists at all — the moment one does, the bootstrap is over.
  if (session.uid === 0) {
    const row = await db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.active, true))
      .get();
    return { verdict: Number(row?.n ?? 0) === 0 ? 'ok' : 'signout', session };
  }

  const account = await db
    .select({
      active: users.active,
      sessionVersion: users.sessionVersion,
      accessUntil: users.accessUntil,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.uid))
    .get();

  return { verdict: checkSession(session, account ?? null), session };
});

/** The session when it is current; null when absent, stale or ended. */
export async function getSession(): Promise<Session | null> {
  const state = await getSessionState();
  return state.verdict === 'ok' ? state.session : null;
}

/**
 * Where to send someone whose session is no longer current. The refresh route
 * re-issues a usable account's session with its current role, or clears the
 * cookie and sends an ended account to sign-in.
 */
function refreshUrl(): string {
  const next = headers().get(PATH_HEADER);
  return next ? `/api/auth/refresh?next=${encodeURIComponent(next)}` : '/api/auth/refresh';
}

/**
 * Every signed-in page calls this (or `getViewer`, which calls it) before it
 * reads anything. `tests/chokepoints.test.ts` fails the build if a page does
 * not, because a page that skips it would keep serving a deactivated person
 * for the rest of their 12-hour session.
 */
export async function requireCurrentAccount(): Promise<Session> {
  const state = await getSessionState();
  if (state.verdict === 'ok') return state.session;
  if (state.verdict === 'none') redirect('/login');
  redirect(refreshUrl());
}

/** Kept for existing callers; identical to `requireCurrentAccount`. */
export const requireSession = requireCurrentAccount;

export async function currentRole(): Promise<Role> {
  return (await getSession())?.role ?? 'ta';
}

/**
 * The session plus the one fact about the user that lives in the database
 * rather than the token: whether they head their team. Read here, once, so
 * pages and routes stop each doing their own users lookup.
 */
export type Viewer = Session & { isTeamLead: boolean };

export async function getViewer(): Promise<Viewer> {
  const session = await requireCurrentAccount();
  const me = session.uid
    ? await db
        .select({ lead: users.isTeamLead })
        .from(users)
        .where(and(eq(users.id, session.uid), eq(users.active, true)))
        .get()
    : undefined;
  return { ...session, isTeamLead: Boolean(me?.lead) };
}
