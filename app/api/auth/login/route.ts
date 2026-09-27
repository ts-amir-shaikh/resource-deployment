import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSession,
  legacyPasswordMatches,
  verifyPassword,
  type Session,
} from '@/lib/auth';
import { landingPath } from '@/lib/access';
import { canSignIn } from '@/lib/accounts/eligibility';
import { findSignInAccount, signInLookup } from '@/lib/accounts/identity';
import { completeSignIn, logEvent } from '@/lib/accounts/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  // `username` is what the form sent before email sign-in; still accepted so
  // an open tab from before a deploy can sign in.
  identifier: z.string().trim().optional(),
  username: z.string().trim().optional(),
  password: z.string().min(1, 'Enter the password'),
});

/** Deliberately vague, and slowed slightly to blunt brute forcing. */
async function reject(message = 'Incorrect email or password') {
  await new Promise((r) => setTimeout(r, 400));
  return NextResponse.json({ error: message }, { status: 401 });
}

export async function POST(req: Request) {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json(
      { error: 'Sign-in is not configured. Set AUTH_SECRET.' },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your email and password' }, { status: 422 });
  }
  const { password } = parsed.data;
  const identifier = parsed.data.identifier || parsed.data.username || '';

  const accounts = await db.select().from(users);

  let session: Session;
  let token: string;

  if (!accounts.some((u) => u.active)) {
    // Bootstrap path: no accounts exist yet, so the pre-roles shared password
    // still works and signs in as admin. This keeps the deployed app reachable
    // during the changeover — the moment the first user is created with
    // `npm run db:user`, this branch stops being taken and the shared password
    // is dead. It is not a permanent backdoor.
    if (!process.env.APP_PASSWORD) {
      return NextResponse.json(
        { error: 'No accounts exist yet. Create one with `npm run db:user`.' },
        { status: 500 },
      );
    }
    if (!legacyPasswordMatches(password)) return reject('Incorrect password');
    session = { uid: 0, name: 'Admin', role: 'admin', sv: 0 };
    token = await createSession(session);
  } else {
    if (!identifier) return reject('Enter your email address');
    const user = findSignInAccount(accounts, signInLookup(identifier));
    // Hash even when no account matches, so a missing account and a wrong
    // password take the same amount of time to reject.
    const salt = user?.passwordSalt ?? 'no-such-user';
    const hash = user?.passwordHash ?? '0'.repeat(64);
    const ok = await verifyPassword(password, salt, hash);
    // Every refusal reads the same to the person signing in (R15); the log
    // records which rule refused it.
    const refusal = !user
      ? 'no_account'
      : !user.hasPassword
        ? 'no_password'
        : !ok
          ? 'wrong_password'
          : !canSignIn(user)
            ? 'not_eligible'
            : null;
    if (refusal || !user) {
      await logEvent({
        kind: 'sign_in_failed',
        subjectUserId: user?.id ?? null,
        method: 'password',
        attemptedIdentifier: identifier.slice(0, 200),
        detail: { reason: refusal },
      });
      return reject();
    }
    ({ token, session } = await completeSignIn(user, 'password'));
  }

  const res = NextResponse.json({
    ok: true,
    role: session.role,
    name: session.name,
    landing: landingPath(session.role),
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
