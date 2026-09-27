import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { SESSION_COOKIE, SESSION_MAX_AGE, verifyShortLived } from '@/lib/auth';
import { canAccess, landingPath } from '@/lib/access';
import { canSignIn } from '@/lib/accounts/eligibility';
import { FLOW_COOKIE, FLOW_PURPOSE, emailFromCallback, googleConfig, type Flow } from '@/lib/accounts/google';
import { findSignInAccount, signInLookup } from '@/lib/accounts/identity';
import { pathOf } from '@/lib/accounts/redirect';
import { completeSignIn, logEvent } from '@/lib/accounts/service';

export const dynamic = 'force-dynamic';

/**
 * Google's answer (KTD4, R13). The flow cookie must match the returned state;
 * the ID token must verify; its email must match an account that can sign in
 * now. Anything else goes back to sign-in with a code, never an address.
 */
export async function GET(req: Request) {
  const config = googleConfig();
  const url = new URL(req.url);
  if (!config) return NextResponse.redirect(new URL('/login?error=google_off', url.origin));

  // Redirects use the registered public address, not the host this request
  // reached behind the proxy.
  const to = (path: string) => NextResponse.redirect(new URL(path, config.redirectUri));
  const clearFlow = (res: NextResponse) => {
    res.cookies.set(FLOW_COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
    return res;
  };

  const payload = await verifyShortLived(FLOW_PURPOSE, cookies().get(FLOW_COOKIE)?.value);
  const flow = payload as unknown as Flow | null;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  // Choosing Cancel on Google's screen comes back as ?error=access_denied.
  if (url.searchParams.get('error')) return clearFlow(to('/login'));
  if (!flow || !code || !state || state !== flow.state) {
    await logEvent({ kind: 'sign_in_failed', method: 'google', detail: { reason: 'state' } });
    return clearFlow(to('/login?error=google_failed'));
  }

  let checked;
  try {
    checked = await emailFromCallback(config, code, flow);
  } catch (err) {
    console.error('[google-callback]', err);
    checked = { ok: false as const, reason: 'network' };
  }
  if (!checked.ok) {
    await logEvent({ kind: 'sign_in_failed', method: 'google', detail: { reason: checked.reason } });
    return clearFlow(to('/login?error=google_failed'));
  }

  const accounts = await db.select().from(users);
  const user = findSignInAccount(accounts, signInLookup(checked.email));
  if (!user || !canSignIn(user)) {
    await logEvent({
      kind: 'sign_in_failed',
      subjectUserId: user?.id ?? null,
      method: 'google',
      attemptedIdentifier: checked.email,
      detail: { reason: user ? 'not_eligible' : 'no_account' },
    });
    return clearFlow(to('/login?error=google_no_account'));
  }

  const { token, session } = await completeSignIn(user, 'google');
  const res = to(flow.next && canAccess(session.role, pathOf(flow.next)) ? flow.next : landingPath(session.role));
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return clearFlow(res);
}
