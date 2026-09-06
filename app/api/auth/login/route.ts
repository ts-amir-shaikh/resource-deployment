import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSession,
  passwordMatches,
} from '@/lib/auth';

export const dynamic = 'force-dynamic';

const schema = z.object({ password: z.string().min(1, 'Enter the password') });

export async function POST(req: Request) {
  if (!process.env.APP_PASSWORD || !process.env.AUTH_SECRET) {
    return NextResponse.json(
      { error: 'Sign-in is not configured. Set APP_PASSWORD and AUTH_SECRET.' },
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
    return NextResponse.json({ error: 'Enter the password' }, { status: 422 });
  }

  if (!passwordMatches(parsed.data.password)) {
    // Deliberately vague, and slowed slightly to blunt brute forcing.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const token = await createSession();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
