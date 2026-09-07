import { NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
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

export const dynamic = 'force-dynamic';

const schema = z.object({
  username: z.string().trim().optional(),
  password: z.string().min(1, 'Enter the password'),
});

/** Deliberately vague, and slowed slightly to blunt brute forcing. */
async function reject(message = 'Incorrect username or password') {
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
    return NextResponse.json({ error: 'Enter your username and password' }, { status: 422 });
  }
  const { username, password } = parsed.data;

  const accounts = await db.select().from(users).where(eq(users.active, true));

  let session: Session;

  if (accounts.length === 0) {
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
    session = { uid: 0, name: 'Admin', role: 'admin' };
  } else {
    if (!username) return reject('Enter your username');
    const user = accounts.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    // Hash even when the username is unknown, so a missing account and a wrong
    // password take the same amount of time to reject.
    const salt = user?.passwordSalt ?? 'no-such-user';
    const hash = user?.passwordHash ?? '0'.repeat(64);
    const ok = await verifyPassword(password, salt, hash);
    if (!user || !ok) return reject();
    session = { uid: user.id, name: user.name, role: user.role };
  }

  const token = await createSession(session);
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
