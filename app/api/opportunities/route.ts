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
import { requireSession, getViewer } from '@/lib/session';
import { visibleOpportunityIds } from '@/lib/ownership';
import { resolveCompany } from '@/lib/prospects';
import { stripClientBudgetAll } from '@/lib/access';
import { getOpportunityCandidateCounts, newShareToken } from '@/lib/queries';
import { isFollowUpDue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const stage = searchParams.get('stage');
    const clientId = searchParams.get('client_id');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search')?.trim();

    const filters = [];
    if (stage === 'open') {
      filters.push(inArray(opportunities.stage, [...PIPELINE_STAGES]));
    } else if (stage) {
      filters.push(eq(opportunities.stage, stage as never));
    }
    if (clientId) filters.push(eq(opportunities.clientId, Number(clientId)));
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
    // budget one fetch away for a role that is not allowed to see it. The same
    // goes for scope — a leadgen who cannot see a requirement on the board must
    // not be able to list it here.
    const viewer = await getViewer();
    const { role } = viewer;
    const visible = await visibleOpportunityIds(viewer);
    const scoped = visible === null ? rows : rows.filter((r) => visible.includes(r.id));

    return ok(
      stripClientBudgetAll(role, scoped).map((o) => {
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
    const session = await requireSession();
    const { data, error } = await parseBody(req, opportunitySchema);
    if (error) return error;

    const created = await db.transaction(async (tx) => {
      const company = await resolveCompany(tx, data, session.uid || null);
      const row = await tx
        .insert(opportunities)
        .values({
          clientId: company.clientId,
          prospectId: company.prospectId,
          companyName: company.companyName,
          // A leadgen person owns what they bring in, from the moment it
          // exists. Everyone else's requirements start unowned and are
          // assigned from the detail page.
          leadOwnerUserId: session.role === 'leadgen' ? session.uid || null : null,
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
          stage: 'requirement',
          priority: data.priority,
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
          userId: session.uid || null,
        })
        .run();

      return row;
    });

    return ok(created, 201);
  });
}
