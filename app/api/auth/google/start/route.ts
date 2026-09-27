import { NextResponse } from 'next/server';
import { signShortLived } from '@/lib/auth';
import { FLOW_COOKIE, FLOW_MINUTES, FLOW_PURPOSE, authorizationUrl, googleConfig, googleDiscovery, newFlow } from '@/lib/accounts/google';
import { safeNext } from '@/lib/accounts/redirect';

export const dynamic = 'force-dynamic';

/**
 * Sends the browser to Google (KTD4). The state, nonce and PKCE verifier ride
 * in a signed cookie scoped to the Google routes, so the callback can prove
 * the answer belongs to this browser's request.
 */
export async function GET(req: Request) {
  const config = googleConfig();
  const url = new URL(req.url);
  if (!config) return NextResponse.redirect(new URL('/login?error=google_off', url.origin));

  const flow = newFlow(safeNext(url.searchParams.get('next')));
  let endpoint: string;
  try {
    endpoint = (await googleDiscovery()).authorization_endpoint;
  } catch (err) {
    console.error('[google-start]', err);
    return NextResponse.redirect(new URL('/login?error=google_failed', config.redirectUri));
  }

  const res = NextResponse.redirect(authorizationUrl(endpoint, config, flow));
  res.cookies.set(FLOW_COOKIE, await signShortLived(FLOW_PURPOSE, flow, FLOW_MINUTES), {
    httpOnly: true,
    // Lax is what lets the cookie come back on Google's top-level redirect.
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth/google',
    maxAge: FLOW_MINUTES * 60,
  });
  return res;
}
