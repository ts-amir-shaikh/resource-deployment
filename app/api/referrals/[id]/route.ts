import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { referrals, candidates, opportunityCandidates } from '@/lib/schema';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

const actionSchema = z.object({
  action: z.enum(['accept', 'dismiss']),
  /** Accept only: also map the new candidate onto the opportunity. */
  mapToOpportunity: z.coerce.boolean().default(true),
});

/**
 * Acts on one referral sitting in the inbox.
 *
 * "accept" is the only path by which a public submission becomes a real
 * candidate — the share link itself cannot write to the pool. The referrer's
 * name is carried through as the candidate's source name, so where a profile
 * came from survives the promotion.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (id === null) return fail('Invalid referral', 400);

    const { data, error } = await parseBody(req, actionSchema);
    if (error) return error;

    const referral = await db.select().from(referrals).where(eq(referrals.id, id)).get();
    if (!referral) return fail('Referral not found', 404);

    if (referral.status !== 'new') {
      return fail(
        `This referral has already been ${referral.status}.`,
        409,
      );
    }

    if (data.action === 'dismiss') {
      await db.update(referrals).set({ status: 'dismissed' }).where(eq(referrals.id, id));
      return ok({ id, status: 'dismissed' });
    }

    // Accept: create the candidate and mark the referral, atomically. Doing
    // these separately could leave a candidate with no referral pointing at
    // it, or a referral marked accepted with nothing created.
    const result = await db.transaction(async (tx) => {
      const candidate = await tx
        .insert(candidates)
        .values({
          name: referral.candidateName,
          email: referral.candidateEmail,
          mobile: referral.candidateMobile,
          experienceYears: referral.experienceYears,
          currentCtc: referral.currentCtc,
          expectedCtc: referral.expectedCtc,
          noticePeriodDays: referral.noticePeriodDays,
          notes: referral.notes,
          source: 'referral',
          sourceName: referral.referrerName,
        })
        .returning()
        .get();

      await tx
        .update(referrals)
        .set({ status: 'accepted', convertedCandidateId: candidate.id })
        .where(eq(referrals.id, id));

      if (data.mapToOpportunity) {
        await tx.insert(opportunityCandidates).values({
          opportunityId: referral.opportunityId,
          candidateId: candidate.id,
          status: 'mapped',
        });
      }

      return candidate;
    });

    return ok({ id, status: 'accepted', candidateId: result.id }, 201);
  });
}
