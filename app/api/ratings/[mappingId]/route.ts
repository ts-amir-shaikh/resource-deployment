import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { candidateRatings, opportunityCandidates, ratingCriteria } from '@/lib/schema';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: { mappingId: string } };

/** Every score recorded against one candidate-on-one-requirement. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireSession();
    const id = parseId(params.mappingId);
    if (!id) return fail('Invalid mapping', 400);

    return ok(
      await db
        .select({
          id: candidateRatings.id,
          criterionId: candidateRatings.criterionId,
          score: candidateRatings.score,
          note: candidateRatings.note,
          label: ratingCriteria.label,
          active: ratingCriteria.active,
        })
        .from(candidateRatings)
        .innerJoin(ratingCriteria, eq(candidateRatings.criterionId, ratingCriteria.id))
        .where(eq(candidateRatings.opportunityCandidateId, id))
        .all(),
    );
  });
}

const saveSchema = z.object({
  scores: z
    .array(
      z.object({
        criterionId: z.coerce.number().int().positive(),
        score: z.coerce.number().int().min(1).max(5),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .default([]),
});

/**
 * Replaces the evaluation for this mapping.
 *
 * Replace rather than merge: an evaluation is one judgement made at one
 * sitting, and a partial merge would leave a score from a previous pass
 * sitting beside fresh ones with nothing to say they came from different days.
 * Criteria the recruiter left blank are simply absent.
 */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const id = parseId(params.mappingId);
    if (!id) return fail('Invalid mapping', 400);

    const mapping = await db
      .select({ id: opportunityCandidates.id })
      .from(opportunityCandidates)
      .where(eq(opportunityCandidates.id, id))
      .get();
    if (!mapping) return fail('This candidate is not mapped to that requirement', 404);

    const { data, error } = await parseBody(req, saveSchema);
    if (error) return error;

    // Reject unknown or retired criteria rather than storing an orphan score.
    if (data.scores.length) {
      const ids = [...new Set(data.scores.map((s) => s.criterionId))];
      const known = await db
        .select({ id: ratingCriteria.id })
        .from(ratingCriteria)
        .where(inArray(ratingCriteria.id, ids))
        .all();
      if (known.length !== ids.length) {
        return fail('One of those rating pointers no longer exists', 422);
      }
    }

    await db.transaction(async (tx) => {
      // Scoped to profile-level scores. Since M29 a score can belong to a
      // specific interview round, and replacing this mapping's screening
      // evaluation must not delete what a panel recorded in round two.
      await tx
        .delete(candidateRatings)
        .where(
          and(
            eq(candidateRatings.opportunityCandidateId, id),
            isNull(candidateRatings.interviewId),
          ),
        )
        .run();
      for (const s of data.scores) {
        await tx
          .insert(candidateRatings)
          .values({
            opportunityCandidateId: id,
            criterionId: s.criterionId,
            score: s.score,
            note: s.note ?? null,
            ratedByUserId: session.uid || null,
          })
          .run();
      }
      // Recording an evaluation is touching the mapping.
      await tx
        .update(opportunityCandidates)
        .set({ updatedByUserId: session.uid || null })
        .where(eq(opportunityCandidates.id, id))
        .run();
    });

    return ok({ mappingId: id, saved: data.scores.length });
  });
}
