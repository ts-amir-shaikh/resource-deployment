import { and, desc, eq, inArray, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  opportunities,
  opportunityStageHistory,
  clients,
  PIPELINE_STAGES,
} from '@/lib/schema';
import { opportunitySchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';
import { getSession } from '@/lib/session';
import { stripClientBudgetAll } from '@/lib/access';
import { getOpportunityCandidateCounts, newShareToken } from '@/lib/queries';
import { isFollowUpDue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage');
    const clientId = searchParams.get('client_id');
    const owner = searchParams.get('owner');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search')?.trim();

    const filters = [];
    if (stage === 'open') {
      filters.push(inArray(opportunities.stage, [...PIPELINE_STAGES]));
    } else if (stage) {
      filters.push(eq(opportunities.stage, stage as never));
    }
    if (clientId) filters.push(eq(opportunities.clientId, Number(clientId)));
    if (owner) filters.push(eq(opportunities.owner, owner));
    if (priority) filters.push(eq(opportunities.priority, priority as never));
    if (search) {
      const q = `%${search}%`;
      filters.push(
        or(
          like(opportunities.title, q),
          like(opportunities.companyName, q),
          like(opportunities.primarySkill, q),
          like(opportunities.location, q),
        ),
      );
    }

    const rows = await db
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
        companyName: opportunities.companyName,
        title: opportunities.title,
        experienceMin: opportunities.experienceMin,
        experienceMax: opportunities.experienceMax,
        primarySkill: opportunities.primarySkill,
        secondarySkill: opportunities.secondarySkill,
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
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(opportunities.id))
      .all();

    const counts = await getOpportunityCandidateCounts();

    // See the detail route: stripping only in the page would leave the client
    // budget one fetch away for a role that is not allowed to see it.
    const { role } = (await getSession()) ?? { role: 'ta' as const };

    return ok(
      stripClientBudgetAll(role, rows).map((o) => {
        const c = counts.find((x) => x.opportunityId === o.id);
        return {
          ...o,
          isProspect: o.clientId === null,
          mappedCount: c?.mapped ?? 0,
          filledCount: c?.filled ?? 0,
          inInterviewCount: c?.inInterview ?? 0,
          followUpDue: isFollowUpDue(o.nextStepDate),
        };
      }),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, opportunitySchema);
    if (error) return error;

    if (data.clientId) {
      const c = await db
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.id, data.clientId))
        .get();
      if (!c) return fail('Selected client no longer exists', 422);
    }

    const created = await db.transaction(async (tx) => {
      const row = await tx
        .insert(opportunities)
        .values({
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
          workingDays: data.workingDays,
          workingHours: data.workingHours,
          stage: 'requirement',
          priority: data.priority,
          owner: data.owner,
          nextStep: data.nextStep,
          nextStepDate: data.nextStepDate,
          shareToken: newShareToken(),
        })
        .returning()
        .get();

      await tx.insert(opportunityStageHistory)
        .values({
          opportunityId: row.id,
          fromStage: null,
          toStage: 'requirement',
          note: 'Opportunity created',
        })
        .run();

      return row;
    });

    return ok(created, 201);
  });
}
