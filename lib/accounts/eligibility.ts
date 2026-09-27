import type { Role } from '@/lib/auth';

/**
 * Whether a signed-in session is still good, decided from the account row.
 *
 * Pure on purpose: every request runs it, and a rule that decides who is still
 * signed in is the one piece of this feature that most needs proof. The
 * caller loads the row and supplies the clock.
 */

export type AccountState = {
  active: boolean;
  sessionVersion: number;
  /** Last working day, inclusive, as YYYY-MM-DD in India time. */
  accessUntil: string | null;
  role: Role;
};

export type SessionClaims = { role: Role; sv: number };

/**
 * - `ok`: serve the request.
 * - `refresh`: the account is fine but the token describes an older state of
 *   it (a role change, a password change elsewhere) — issue a fresh session.
 * - `signout`: the account can no longer sign in at all.
 */
export type Verdict = 'ok' | 'refresh' | 'signout';

/** Today's date in India, where every access-until date is set. */
export function todayInIndia(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** True while `accessUntil` has not passed. The date itself still works. */
export function withinAccess(accessUntil: string | null, now: Date = new Date()): boolean {
  return accessUntil === null || todayInIndia(now) <= accessUntil;
}

/** True when the account may sign in at all, ignoring any existing session. */
export function canSignIn(account: Pick<AccountState, 'active' | 'accessUntil'>, now: Date = new Date()): boolean {
  return account.active && withinAccess(account.accessUntil, now);
}

export function checkSession(
  claims: SessionClaims,
  account: AccountState | null,
  now: Date = new Date(),
): Verdict {
  if (!account || !canSignIn(account, now)) return 'signout';
  // The role check is belt and braces: every role change also bumps the
  // version, but a row edited by hand would otherwise keep its old access.
  if (claims.sv !== account.sessionVersion || claims.role !== account.role) return 'refresh';
  return 'ok';
}
