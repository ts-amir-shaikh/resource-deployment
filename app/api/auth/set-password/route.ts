import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeLink } from '@/lib/accounts/service';

export const dynamic = 'force-dynamic';

const schema = z.object({
  token: z.string().trim().min(1),
  password: z.string(),
});

/**
 * Public: sets a password from an emailed link. The link's code arrives in the
 * request body, never the address — see lib/accounts/links.ts — and only a
 * hash of it is looked up.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'This link is no longer valid. Ask Admin to send a new one.' }, { status: 400 });
  }

  const result = await consumeLink(parsed.data.token, parsed.data.password);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
  return NextResponse.json({ ok: true });
}
