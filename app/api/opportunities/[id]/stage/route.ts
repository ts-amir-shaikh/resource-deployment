import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, opportunityStageHistory } from '@/lib/schema';
import { stageMoveSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getStageBeforeHold } from '@/lib/queries';
import { STAGE_LABELS } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Moves an opportunity to another stage.
 *
 * Unlike the invoice lifecycle this is deliberately bidirectional — deals
 * regress, and a requirement can drop back to qualification when the brief
 * changes. Every move is written to opportunity_stage_history.
 *
 * Resuming from 'hold' is handled by the caller passing the stage to return
 * to; GET /resume-target (below, via the detail payload) exposes what that
 * would be so the UI can offer it as the default.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const existing = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!existing) return fail('Opportunity not found', 404);

    const { data, error } = await parseBody(req, stageMoveSchema);
    if (error) return error;

    if (data.toStage === existing.stage) {
      return fail(
        `This opportunity is already at "${STAGE_LABELS[existing.stage]}".`,
        409,
      );
    }

    if (existing.convertedProjectId && data.toStage !== 'won') {
      return fail(
        'This opportunity has been converted into a project and can no longer change stage.',
        409,
      );
    }

    const closing = ['won', 'lost'].includes(data.toStage);
    // A filled or dead role must not stay advertised. Withdrawing it is part
    // of closing the deal, not a separate chore somebody remembers later.
    const wasListed = existing.isListed;

    const patch: Partial<typeof opportunities.$inferInsert> = {
      stage: data.toStage as never,
      // Reason belongs only to lost/hold; clear it when the deal reopens.
      closedReason: ['lost', 'hold'].includes(data.toStage)
        ? data.closedReason
        : null,
      ...(closing ? { isListed: false, listedAt: null } : {}),
    };

    const row = await db.transaction(async (tx) => {
      const updated = await tx
        .update(opportunities)
        .set(patch)
        .where(eq(opportunities.id, id))
        .returning()
        .get();

      await tx.insert(opportunityStageHistory)
        .values({
          opportunityId: id,
          fromStage: existing.stage,
          toStage: data.toStage,
          note: data.note ?? data.closedReason ?? null,
        })
        .run();

      return updated;
    });

    // Reported back so the UI can say the advert came down, rather than the
    // listing vanishing silently.
    return ok({ ...row, delisted: closing && wasListed });
  });
}

/** The stage a held opportunity would resume to. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);
    return ok({ resumeTo: await getStageBeforeHold(id) ?? 'requirement' });
  });
}
