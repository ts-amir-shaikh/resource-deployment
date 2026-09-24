import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients, prospects } from '@/lib/schema';
import { getOpportunityCandidateCounts, getStageSince } from '@/lib/queries';
import { isFollowUpDue } from '@/lib/utils';
import { getViewer } from '@/lib/session';
import { visibleOpportunityIds } from '@/lib/ownership';
import { stripClientBudgetAll } from '@/lib/access';
import PipelineClient from './client';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const viewer = await getViewer();
  const { role } = viewer;

  // Independent of each other — run concurrently.
  const [rows, counts, stageSince, clientOptions, prospectOptions, visibleIds] = await Promise.all([
    db
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
        hiringBudgetMin: opportunities.hiringBudgetMin,
        hiringBudgetMax: opportunities.hiringBudgetMax,
        dealValue: opportunities.dealValue,
        isListed: opportunities.isListed,
        stage: opportunities.stage,
        priority: opportunities.priority,
        leadOwnerUserId: opportunities.leadOwnerUserId,
        salesOwnerUserId: opportunities.salesOwnerUserId,
        nextStep: opportunities.nextStep,
        nextStepDate: opportunities.nextStepDate,
        closedReason: opportunities.closedReason,
        convertedProjectId: opportunities.convertedProjectId,
        createdAt: opportunities.createdAt,
        clientName: clients.companyName,
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .orderBy(desc(opportunities.id))
      .all(),
    getOpportunityCandidateCounts(),
    getStageSince(),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
    db
      .select({ id: prospects.id, companyName: prospects.companyName })
      .from(prospects)
      .where(isNull(prospects.convertedClientId))
      .orderBy(prospects.companyName)
      .all(),
    // Leadgen sees their own (or, as head, their team's); everyone else the
    // whole board. Decided in lib/ownership.ts, not here.
    visibleOpportunityIds(viewer),
  ]);

  const scoped = visibleIds === null ? rows : rows.filter((r) => visibleIds.includes(r.id));

  // What the client pays never reaches a TA browser — stripped here, on the
  // server, rather than hidden in the markup.
  const visible = stripClientBudgetAll(role, scoped);

  const initial = visible.map((o) => {
    const c = counts.find((x) => x.opportunityId === o.id);
    const moved = stageSince.find((x) => x.opportunityId === o.id)?.since;
    return {
      ...o,
      isProspect: o.clientId === null,
      mappedCount: c?.mapped ?? 0,
      filledCount: c?.filled ?? 0,
      // Never moved → it has been sitting where it started since day one.
      stageSince: moved ?? o.createdAt,
      followUpDue: isFollowUpDue(o.nextStepDate),
    };
  });

  return (
    <PipelineClient
      initial={initial}
      clients={clientOptions}
      prospects={prospectOptions}
      role={role}
    />
  );
}
