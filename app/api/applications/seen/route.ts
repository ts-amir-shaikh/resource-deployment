import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { requireSession } from '@/lib/session';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Stamps "I have looked at the queue" for the signed-in user.
 *
 * A watermark on the user row rather than a per-row read flag: the question
 * the badge answers is only ever "anything since I last looked?", and one
 * column answers it without a notification lifecycle to keep consistent.
 *
 * Management never reaches this — the role writes nothing by policy — so their
 * badge shows what is pending rather than what is new. The page knows that and
 * does not call this route for them.
 */
export async function POST() {
  return handle(async () => {
    const session = await requireSession();
    if (!session.uid) return ok({ stamped: false });

    const at = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await db.update(users).set({ applicationsSeenAt: at }).where(eq(users.id, session.uid));
    return ok({ stamped: true, at });
  });
}
