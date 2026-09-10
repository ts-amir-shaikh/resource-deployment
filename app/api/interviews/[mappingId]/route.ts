import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  candidateInterviews,
  interviewPanel,
  opportunityCandidates,
} from '@/lib/schema';
import { interviewSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { listRounds, syncMappingFromRounds } from '@/lib/interviews';

export const dynamic = 'force-dynamic';

type Ctx = { params: { mappingId: string } };

/** Every round this candidate has sat for this requirement, newest first. */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireSession();
    const id = parseId(params.mappingId);
    if (!id) return fail('Invalid mapping', 400);
    return ok({ rounds: await listRounds(id) });
  });
}

/**
 * Logs one interview round, and optionally moves the candidate in the same
 * request.
 *
 * The two used to be separate edits, which is exactly why the second one
 * frequently never happened — feedback got written and the candidate sat in
 * "interview" for a fortnight. One request, one transaction: either both land
 * or neither does.
 */
export async function POST(req: Request, { params }: Ctx) {
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

    const { data, error } = await parseBody(req, interviewSchema);
    if (error) return error;

    const created = await db.transaction(async (tx) => {
      const round = await tx
        .insert(candidateInterviews)
        .values({
          opportunityCandidateId: id,
          round: data.round,
          mode: data.mode,
          scheduledAt: data.scheduledAt ?? null,
          heldAt: data.heldAt ?? null,
          outcome: data.outcome ?? null,
          feedback: data.feedback ?? null,
          recommendation: data.recommendation ?? null,
          questionsAsked: data.questionsAsked ?? null,
          loggedByUserId: session.uid || null,
        })
        .returning()
        .get();

      for (const member of data.panel) {
        await tx
          .insert(interviewPanel)
          .values({
            interviewId: round.id,
            name: member.name,
            designation: member.designation ?? null,
          })
          .run();
      }

      await syncMappingFromRounds(tx, id, {
        moveStatus: data.moveStatus,
        userId: session.uid || null,
      });

      return round;
    });

    return ok({ id: created.id, mappingId: id }, 201);
  });
}
