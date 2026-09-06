import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';

/**
 * Gates the whole app behind a session cookie, with two deliberate exceptions:
 *
 *   /share/*      the public stakeholder view — the entire point is that
 *                 consultants without accounts can open it
 *   /api/share/*  the matching read + suggestion endpoints
 *
 * Everything else, including every /api route, requires a valid session.
 */
const PUBLIC_PREFIXES = ['/share/', '/api/share/'];
const PUBLIC_EXACT = ['/login', '/api/auth/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (authed) return NextResponse.next();

  // API callers get a clean 401 rather than an HTML redirect.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  // Preserve where they were heading so login can return them there.
  url.searchParams.set('next', pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
