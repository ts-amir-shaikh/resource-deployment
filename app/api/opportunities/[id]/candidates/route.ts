import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, opportunityCandidates, candidates } from '@/lib/schema';
import {
  candidateMappingSchema,
  candidateMappingUpdateSchema,
} from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/** Map a candidate onto this opportunity. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const opp = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!opp) return fail('Opportunity not found', 404);

    const { data, error } = await parseBody(req, candidateMappingSchema);
    if (error) return error;

    const cand = await db
      .select({ id: candidates.id, name: candidates.name })
      .from(candidates)
      .where(eq(candidates.id, data.candidateId))
      .get();
    if (!cand) return fail('Selected candidate no longer exists', 422);

    const dupe = await db
      .select({ id: opportunityCandidates.id })
      .from(opportunityCandidates)
      .where(
        and(
          eq(opportunityCandidates.opportunityId, id),
          eq(opportunityCandidates.candidateId, data.candidateId),
        ),
      )
      .get();
    if (dupe) {
      return fail(`${cand.name} is already mapped to this opportunity.`, 409);
    }

    const row = await db
      .insert(opportunityCandidates)
      .values({
        opportunityId: id,
        candidateId: data.candidateId,
        userId: session.uid || null,
        updatedByUserId: session.uid || null,
        status: data.status,
        interviewRound: data.interviewRound,
        interviewDate: data.interviewDate,
        feedback: data.feedback,
        expectedBilling: data.expectedBilling,
      })
      .returning()
      .get();

    return ok(row, 201);
  });
}

/** Update one mapping's interview progress. `?mapping_id=` selects the row. */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const mappingId = parseId(
      new URL(req.url).searchParams.get('mapping_id') ?? '',
    );
    if (!mappingId) return fail('A mapping_id query parameter is required', 400);

    const existing = await db
      .select()
      .from(opportunityCandidates)
      .where(
        and(
          eq(opportunityCandidates.id, mappingId),
          eq(opportunityCandidates.opportunityId, id),
        ),
      )
      .get();
    if (!existing) return fail('Candidate mapping not found', 404);

    const { data, error } = await parseBody(req, candidateMappingUpdateSchema);
    if (error) return error;

    const row = await db
      .update(opportunityCandidates)
      .set({
        updatedByUserId: session.uid || null,
        status: data.status,
        interviewRound: data.interviewRound,
        interviewDate: data.interviewDate,
        feedback: data.feedback,
        expectedBilling: data.expectedBilling,
      })
      .where(eq(opportunityCandidates.id, mappingId))
      .returning()
      .get();

    return ok(row);
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const mappingId = parseId(
      new URL(req.url).searchParams.get('mapping_id') ?? '',
    );
    if (!mappingId) return fail('A mapping_id query parameter is required', 400);

    const existing = await db
      .select()
      .from(opportunityCandidates)
      .where(
        and(
          eq(opportunityCandidates.id, mappingId),
          eq(opportunityCandidates.opportunityId, id),
        ),
      )
      .get();
    if (!existing) return fail('Candidate mapping not found', 404);

    await db.delete(opportunityCandidates)
      .where(eq(opportunityCandidates.id, mappingId))
      .run();

    return ok({ deleted: mappingId });
  });
}
