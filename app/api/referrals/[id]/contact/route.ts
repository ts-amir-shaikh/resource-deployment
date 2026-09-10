import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { referrals } from '@/lib/schema';
import { contactLogSchema } from '@/lib/validations';
import { requireSession } from '@/lib/session';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Records that somebody rang this applicant, and how it went.
 *
 * Deliberately separate from the accept/dismiss route. Having spoken to
 * someone is not a decision about them: a recruiter can reach an applicant,
 * learn they have already accepted another offer, and dismiss them — or reach
 * nobody after three attempts and still want them in the pool. Folding the two
 * together would force one to imply the other.
 *
 * Who called is taken from the session, never from the payload.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const session = await requireSession();
    const id = parseId(params.id);
    if (id === null) return fail('Invalid application', 400);

    const { data, error } = await parseBody(req, contactLogSchema);
    if (error) return error;

    const existing = await db
      .select({ id: referrals.id })
      .from(referrals)
      .where(eq(referrals.id, id))
      .get();
    if (!existing) return fail('Application not found', 404);

    // Resetting to "not contacted" clears the trail rather than leaving a
    // stale caller and timestamp attached to a state that contradicts them.
    const cleared = data.contactStatus === 'not_contacted';

    await db
      .update(referrals)
      .set({
        contactStatus: data.contactStatus,
        contactNote: data.contactNote ?? null,
        lastContactedAt: cleared ? null : new Date().toISOString().slice(0, 10),
        contactedByUserId: cleared ? null : session.uid || null,
      })
      .where(eq(referrals.id, id));

    return ok({ id, contactStatus: data.contactStatus });
  });
}
