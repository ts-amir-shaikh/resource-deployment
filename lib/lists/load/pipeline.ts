import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients, users } from '@/lib/schema';
import { getOpportunityCandidateCounts, getStageSince } from '@/lib/queries';
import { isFollowUpDue } from '@/lib/utils';
import { visibleOpportunityIds } from '@/lib/ownership';
import { stripClientBudgetAll } from '@/lib/access';
import type { Viewer } from '@/lib/session';

/**
 * The requirements this viewer's pipeline shows: scoped per row by
 * lib/ownership.ts and with client budgets stripped for TA, exactly as the
 * screen gets them. The export route calls this too, so a file can never hold
 * a row or a figure the same person could not see on the board.
 */
export async function loadPipeline(viewer: Viewer) {
  const { role } = viewer;

  // Independent of each other — run concurrently.
  const [rows, counts, stageSince, visibleIds] = await Promise.all([
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
    // Leadgen sees their own (or, as head, their team's); everyone else the
    // whole board. Decided in lib/ownership.ts, not here.
    visibleOpportunityIds(viewer),
  ]);

  const scoped = visibleIds === null ? rows : rows.filter((r) => visibleIds.includes(r.id));

  // What the client pays never reaches a TA browser — stripped here, on the
  // server, rather than hidden in the markup.
  const visible = stripClientBudgetAll(role, scoped);

  // Owner names for the export and the list; one lookup for every owner.
  const ownerIds = [
    ...new Set(
      visible.flatMap((o) => [o.leadOwnerUserId, o.salesOwnerUserId]).filter((id): id is number => id !== null),
    ),
  ];
  const owners = ownerIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ownerIds)).all()
    : [];
  const nameOf = (id: number | null) => (id === null ? null : owners.find((u) => u.id === id)?.name ?? null);

  return visible.map((o) => {
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
      leadOwnerName: nameOf(o.leadOwnerUserId),
      salesOwnerName: nameOf(o.salesOwnerUserId),
    };
  });
}

export type PipelineRow = Awaited<ReturnType<typeof loadPipeline>>[number];
