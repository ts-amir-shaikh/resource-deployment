import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  opportunities,
  opportunityCandidates,
  opportunityComments,
  opportunityStageHistory,
  candidates,
  clients,
} from '@/lib/schema';
import { opportunitySchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getSession } from '@/lib/session';
import { stripClientBudget } from '@/lib/access';
import { isFollowUpDue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const row = await db
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
        companyName: opportunities.companyName,
        title: opportunities.title,
        experienceMin: opportunities.experienceMin,
        experienceMax: opportunities.experienceMax,
        primarySkill: opportunities.primarySkill,
        secondarySkill: opportunities.secondarySkill,
        otherSkills: opportunities.otherSkills,
        workMode: opportunities.workMode,
        location: opportunities.location,
        timezone: opportunities.timezone,
        engagementType: opportunities.engagementType,
        requiredCount: opportunities.requiredCount,
        currency: opportunities.currency,
        budgetMin: opportunities.budgetMin,
        budgetMax: opportunities.budgetMax,
        dealValue: opportunities.dealValue,
        hiringBudgetMin: opportunities.hiringBudgetMin,
        hiringBudgetMax: opportunities.hiringBudgetMax,
        jdContent: opportunities.jdContent,
        workingDays: opportunities.workingDays,
        workingHours: opportunities.workingHours,
        stage: opportunities.stage,
        priority: opportunities.priority,
        owner: opportunities.owner,
        nextStep: opportunities.nextStep,
        nextStepDate: opportunities.nextStepDate,
        closedReason: opportunities.closedReason,
        shareToken: opportunities.shareToken,
        convertedProjectId: opportunities.convertedProjectId,
        createdAt: opportunities.createdAt,
        clientName: clients.companyName,
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .where(eq(opportunities.id, id))
      .get();

    if (!row) return fail('Opportunity not found', 404);

    const mapped = await db
      .select({
        id: opportunityCandidates.id,
        candidateId: opportunityCandidates.candidateId,
        status: opportunityCandidates.status,
        interviewRound: opportunityCandidates.interviewRound,
        interviewDate: opportunityCandidates.interviewDate,
        feedback: opportunityCandidates.feedback,
        expectedBilling: opportunityCandidates.expectedBilling,
        name: candidates.name,
        email: candidates.email,
        currentDesignation: candidates.currentDesignation,
        experienceYears: candidates.experienceYears,
        primarySkill: candidates.primarySkill,
        source: candidates.source,
        sourceName: candidates.sourceName,
        expectedCtc: candidates.expectedCtc,
        noticePeriodDays: candidates.noticePeriodDays,
      })
      .from(opportunityCandidates)
      .innerJoin(candidates, eq(opportunityCandidates.candidateId, candidates.id))
      .where(eq(opportunityCandidates.opportunityId, id))
      .all();

    const comments = await db
      .select()
      .from(opportunityComments)
      .where(eq(opportunityComments.opportunityId, id))
      .orderBy(desc(opportunityComments.id))
      .all();

    const history = await db
      .select()
      .from(opportunityStageHistory)
      .where(eq(opportunityStageHistory.opportunityId, id))
      .orderBy(desc(opportunityStageHistory.id))
      .all();

    // The pages strip this too, but the API is reachable on its own — a role
    // that cannot see the client budget on screen must not be able to curl it.
    const { role } = (await getSession()) ?? { role: 'ta' as const };

    return ok({
      ...stripClientBudget(role, row),
      isProspect: row.clientId === null,
      followUpDue: isFollowUpDue(row.nextStepDate),
      candidates: mapped,
      comments,
      stageHistory: history,
    });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const existing = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!existing) return fail('Opportunity not found', 404);

    const { data, error } = await parseBody(req, opportunitySchema);
    if (error) return error;

    // Stage is not editable here — it moves through /stage so history is kept.
    const row = await db
      .update(opportunities)
      .set({
        clientId: data.clientId ?? null,
        companyName: data.companyName,
        title: data.title,
        experienceMin: data.experienceMin,
        experienceMax: data.experienceMax,
        primarySkill: data.primarySkill,
        secondarySkill: data.secondarySkill,
        otherSkills: JSON.stringify(data.otherSkills ?? []),
        workMode: data.workMode,
        location: data.location,
        timezone: data.timezone,
        engagementType: data.engagementType,
        requiredCount: data.requiredCount,
        currency: data.currency,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        dealValue: data.dealValue,
        hiringBudgetMin: data.hiringBudgetMin,
        hiringBudgetMax: data.hiringBudgetMax,
        jdContent: data.jdContent,
        publicCompanyLabel: data.publicCompanyLabel,
        showClientName: data.showClientName,
        workingDays: data.workingDays,
        workingHours: data.workingHours,
        priority: data.priority,
        owner: data.owner,
        nextStep: data.nextStep,
        nextStepDate: data.nextStepDate,
      })
      .where(eq(opportunities.id, id))
      .returning()
      .get();

    return ok(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const existing = await db
      .select()
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!existing) return fail('Opportunity not found', 404);

    // Once converted, deleting would orphan the delivery-side project link.
    if (existing.convertedProjectId) {
      return fail(
        'This opportunity has been converted into a project and cannot be deleted.',
        409,
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(opportunityCandidates)
        .where(eq(opportunityCandidates.opportunityId, id))
        .run();
      await tx.delete(opportunityComments)
        .where(eq(opportunityComments.opportunityId, id))
        .run();
      await tx.delete(opportunityStageHistory)
        .where(eq(opportunityStageHistory.opportunityId, id))
        .run();
      await tx.delete(opportunities).where(eq(opportunities.id, id)).run();
    });

    return ok({ deleted: id });
  });
}
