import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth';
import { WRITE_METHODS, canAccess, canWrite, landingPath } from '@/lib/access';

/**
 * Gates the whole app behind a session cookie, then applies the role policy
 * from lib/access.ts — route access first, then write permission.
 *
 * Two deliberate exceptions run unauthenticated:
 *
 *   /share/*      the public stakeholder view — the entire point is that
 *                 consultants without accounts can open it
 *   /api/share/*  the matching read endpoint and referral submission
 *
 * Enforcing writes here rather than in each route handler means a new API
 * route is covered by the policy the moment it exists, instead of being open
 * until someone remembers to add a guard to it.
 */
const PUBLIC_PREFIXES = ['/share/', '/api/share/'];
const PUBLIC_EXACT = ['/login', '/api/auth/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  if (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next();
  }

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    // API callers get a clean 401 rather than an HTML redirect.
    if (isApi) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    // Preserve where they were heading so login can return them there.
    url.searchParams.set('next', pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }

  if (!canAccess(session.role, pathname)) {
    if (isApi) {
      return NextResponse.json(
        { error: 'Your role does not have access to this area.' },
        { status: 403 },
      );
    }
    // Send them to their own home rather than showing a dead end.
    const url = req.nextUrl.clone();
    url.pathname = landingPath(session.role);
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (WRITE_METHODS.has(req.method) && !canWrite(session.role, pathname)) {
    return NextResponse.json(
      {
        error:
          session.role === 'management'
            ? 'Management access is view-only.'
            : 'Your role cannot make this change.',
      },
      { status: 403 },
    );
  }

  // Server components and route handlers read the identity by verifying the
  // cookie themselves (lib/session.ts) rather than trusting a header set here
  // — a forwarded header is only as trustworthy as every path that forwards
  // it, and /share/* deliberately passes requests through untouched.
  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
