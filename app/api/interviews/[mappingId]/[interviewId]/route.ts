import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidateInterviews, interviewPanel } from '@/lib/schema';
import { interviewUpdateSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { syncMappingFromRounds } from '@/lib/interviews';

export const dynamic = 'force-dynamic';

type Ctx = { params: { mappingId: string; interviewId: string } };

/**
 * Fills in a round — typically one that was logged as scheduled and has now
 * been held.
 *
 * Editing a round is not the same as a later round overwriting it: this
 * changes the record of one sitting, and every other round is untouched. That
 * distinction is the whole reason this table exists.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const mappingId = parseId(params.mappingId);
    const interviewId = parseId(params.interviewId);
    if (!mappingId || !interviewId) return fail('Invalid round', 400);

    // Scoped to the mapping in the URL, so an id from one candidate cannot be
    // used to edit another's round.
    const existing = await db
      .select({ id: candidateInterviews.id })
      .from(candidateInterviews)
      .where(
        and(
          eq(candidateInterviews.id, interviewId),
          eq(candidateInterviews.opportunityCandidateId, mappingId),
        ),
      )
      .get();
    if (!existing) return fail('That interview round was not found', 404);

    const { data, error } = await parseBody(req, interviewUpdateSchema);
    if (error) return error;

    await db.transaction(async (tx) => {
      await tx
        .update(candidateInterviews)
        .set({
          round: data.round,
          mode: data.mode,
          scheduledAt: data.scheduledAt ?? null,
          heldAt: data.heldAt ?? null,
          outcome: data.outcome ?? null,
          feedback: data.feedback ?? null,
          recommendation: data.recommendation ?? null,
          questionsAsked: data.questionsAsked ?? null,
        })
        .where(eq(candidateInterviews.id, interviewId))
        .run();

      // The panel is replaced wholesale — it is one list, edited as a list,
      // and a merge would need identity for rows that have none.
      await tx.delete(interviewPanel).where(eq(interviewPanel.interviewId, interviewId)).run();
      for (const member of data.panel) {
        await tx
          .insert(interviewPanel)
          .values({
            interviewId,
            name: member.name,
            designation: member.designation ?? null,
          })
          .run();
      }

      await syncMappingFromRounds(tx, mappingId, {
        moveStatus: data.moveStatus,
        userId: session.uid || null,
      });
    });

    return ok({ id: interviewId, mappingId });
  });
}
