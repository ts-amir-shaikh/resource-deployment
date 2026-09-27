import { NextResponse, type NextRequest } from 'next/server';
import { PATH_HEADER, SESSION_COOKIE, SIGNED_IN_HEADER, verifySession } from '@/lib/auth';
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
 *   /jobs/*       the public job board and its apply form
 *   /api/jobs/*   the matching read and apply endpoints
 *   /api/health   liveness/readiness for the deploy script and proxy
 *   /set-password the landing page of an emailed password link, and its API
 *
 * Enforcing writes here rather than in each route handler means a new API
 * route is covered by the policy the moment it exists, instead of being open
 * until someone remembers to add a guard to it.
 */
export const PUBLIC_PREFIXES = ['/share/', '/api/share/', '/jobs/', '/api/jobs/'];
export const PUBLIC_EXACT = [
  '/login',
  '/api/auth/login',
  '/jobs',
  '/api/jobs',
  '/api/health',
  // Where an emailed password link lands, and the call it makes. The person
  // has no session yet; the link's own code is what authorises the change.
  '/set-password',
  '/api/auth/set-password',
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // Never trust these from outside: server code reads them as "this request
  // passed the sign-in gate", so a forged one must not survive.
  const forwarded = new Headers(req.headers);
  forwarded.delete(SIGNED_IN_HEADER);
  forwarded.delete(PATH_HEADER);

  if (
    PUBLIC_EXACT.includes(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    return NextResponse.next({ request: { headers: forwarded } });
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

  // Server components and route handlers still read the identity by verifying
  // the cookie themselves (lib/session.ts) rather than trusting anything set
  // here. The marker only tells them the request needs the account check —
  // whether this person may still be signed in, which Edge code cannot answer
  // because it cannot open the AWS host's SQLite file.
  forwarded.set(SIGNED_IN_HEADER, '1');
  forwarded.set(PATH_HEADER, pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  // Skip Next internals and static assets.
  //
  // robots.txt is excluded deliberately: the matcher gated it behind the login
  // redirect, so crawlers were served an HTML sign-in page instead of the
  // directives — which made the whole file useless.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
