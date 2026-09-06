import { and, eq, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  candidates,
  opportunityCandidates,
  opportunities,
  resources,
} from '@/lib/schema';
import { candidateSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid candidate id', 400);

    const row = await db.select().from(candidates).where(eq(candidates.id, id)).get();
    if (!row) return fail('Candidate not found', 404);

    const mapped = await db
      .select({
        id: opportunityCandidates.id,
        opportunityId: opportunityCandidates.opportunityId,
        status: opportunityCandidates.status,
        interviewRound: opportunityCandidates.interviewRound,
        interviewDate: opportunityCandidates.interviewDate,
        feedback: opportunityCandidates.feedback,
        expectedBilling: opportunityCandidates.expectedBilling,
        title: opportunities.title,
        companyName: opportunities.companyName,
        stage: opportunities.stage,
      })
      .from(opportunityCandidates)
      .innerJoin(
        opportunities,
        eq(opportunityCandidates.opportunityId, opportunities.id),
      )
      .where(eq(opportunityCandidates.candidateId, id))
      .all();

    const linkedResource = row.resourceId
      ? await db.select().from(resources).where(eq(resources.id, row.resourceId)).get()
      : null;

    return ok({ ...row, opportunities: mapped, resource: linkedResource ?? null });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid candidate id', 400);

    const existing = await db.select().from(candidates).where(eq(candidates.id, id)).get();
    if (!existing) return fail('Candidate not found', 404);

    const { data, error } = await parseBody(req, candidateSchema);
    if (error) return error;

    const row = await db
      .update(candidates)
      .set({
        resourceId: data.resourceId ?? null,
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        currentDesignation: data.currentDesignation,
        experienceYears: data.experienceYears,
        primarySkill: data.primarySkill,
        secondarySkill: data.secondarySkill,
        otherSkills: JSON.stringify(data.otherSkills ?? []),
        currentCtc: data.currentCtc,
        expectedCtc: data.expectedCtc,
        noticePeriodDays: data.noticePeriodDays,
        location: data.location,
        source: data.source,
        sourceName: data.sourceName,
        notes: data.notes,
      })
      .where(eq(candidates.id, id))
      .returning()
      .get();

    return ok(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid candidate id', 400);

    // Guard: still in play on an opportunity that has not been closed out.
    const live = await db
      .select({ id: opportunityCandidates.id })
      .from(opportunityCandidates)
      .where(
        and(
          eq(opportunityCandidates.candidateId, id),
          notInArray(opportunityCandidates.status, ['rejected', 'withdrawn']),
        ),
      )
      .all();

    if (live.length) {
      return fail(
        `This candidate is mapped to ${live.length} live opportunit${live.length > 1 ? 'ies' : 'y'}. Mark those rejected or withdrawn first.`,
        409,
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(opportunityCandidates)
        .where(eq(opportunityCandidates.candidateId, id))
        .run();
      await tx.delete(candidates).where(eq(candidates.id, id)).run();
    });

    return ok({ deleted: id });
  });
}
