import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession } from '@/lib/auth';
import { canAccess, landingPath } from '@/lib/access';
import { getSessionState } from '@/lib/session';

export const dynamic = 'force-dynamic';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

/** Only same-site paths; never an absolute or protocol-relative URL. */
function safeNext(raw: string | null): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return null;
  return raw;
}

function pathOf(next: string): string {
  return next.split('?')[0];
}

/**
 * Where a page sends someone whose session no longer matches their account.
 *
 * An account that can still sign in gets a fresh session carrying its current
 * role and version, then goes back to the page it asked for if that role may
 * open it, or to the role's home if not — a TA turned into Sales lands on
 * /sales, not on a refusal. An account that has ended has its cookie cleared
 * and goes to sign-in. This route runs outside `handle()` on purpose: its whole
 * job is to act on a session that `handle()` would refuse.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = safeNext(url.searchParams.get('next'));
  const state = await getSessionState();

  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  if (state.verdict === 'ok') {
    const role = state.session.role;
    return to(next && canAccess(role, pathOf(next)) ? next : landingPath(role));
  }

  if (state.verdict === 'refresh') {
    const account = await db
      .select({ name: users.name, role: users.role, sessionVersion: users.sessionVersion })
      .from(users)
      .where(eq(users.id, state.session.uid))
      .get();
    if (account) {
      const token = await createSession({
        uid: state.session.uid,
        name: account.name,
        role: account.role,
        sv: account.sessionVersion,
      });
      const res = to(next && canAccess(account.role, pathOf(next)) ? next : landingPath(account.role));
      res.cookies.set(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE });
      return res;
    }
  }

  const res = to('/login');
  res.cookies.set(SESSION_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  return res;
}
