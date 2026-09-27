import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE, SESSION_MAX_AGE, createSession } from '@/lib/auth';
import { getSession } from '@/lib/session';
import { changeOwnPassword } from '@/lib/accounts/service';

export const dynamic = 'force-dynamic';

const schema = z.object({ current: z.string(), next: z.string() });

/**
 * Changing your own password (R10). Storing it stamps sessions_revoked_at,
 * which signs out every session issued before now (R21); this device gets a
 * fresh session issued after the stamp, so it stays signed in.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !session.uid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Enter your current and new password' }, { status: 422 });

  const result = await changeOwnPassword(session.uid, parsed.data.current, parsed.data.next);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });

  const token = await createSession({ uid: session.uid, name: result.name, role: result.role, sv: result.sessionVersion });
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
