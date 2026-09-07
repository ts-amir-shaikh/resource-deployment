import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySession, type Role, type Session } from './auth';

/**
 * Reads the current user inside server components and route handlers.
 *
 * Verifies the signed cookie directly rather than trusting a header forwarded
 * by middleware — the signature is the thing that can't be forged, and this
 * stays correct even on the routes middleware waves through.
 */
export async function getSession(): Promise<Session | null> {
  return verifySession(cookies().get(SESSION_COOKIE)?.value);
}

/**
 * For pages that middleware has already gated. Reaching here without a session
 * means the route escaped the matcher, which is a bug, not a login prompt —
 * so it fails loudly instead of silently rendering as some default role.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error('No session — this route should be gated by middleware.');
  return session;
}

export async function currentRole(): Promise<Role> {
  return (await getSession())?.role ?? 'ta';
}
