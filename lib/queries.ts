import 'server-only';
import { and, eq, ne, sql, desc, inArray, isNull, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db, type Executor } from './db';
import {
  deployments,
  resources,
  projects,
  clients,
  agreements,
  agreementResources,
  invoices,
  opportunities,
  candidates,
  opportunityCandidates,
  opportunityStageHistory,
  referrals,
  users,
  candidateInterviews,
  opportunityAssignees,
  PIPELINE_STAGES,
} from './schema';
import {
  GST_RATE,
  today,
  sumByCurrency,
  valueSummary,
  deploymentMoney,
  effectiveCtc,
  addDays,
  daysBetween,
  type MoneyByCurrency,
} from './utils';

/** M30-3: a live mapping untouched this long is flagged as stalled. */
export { STALL_DAYS } from './utils';
import { STALL_DAYS } from './utils';
import crypto from 'node:crypto';

/* ── Allocation ────────────────────────────────────────────── */

export type AllocationBreakdown = {
  billable: number;
  shadow: number;
  total: number;
  free: number;
  entries: {
    deploymentId: number;
    projectId: number;
    projectName: string;
    clientName: string;
    deploymentType: 'billable' | 'shadow';
    allocationPercentage: number;
  }[];
};

/**
 * Allocation consumed by a resource's active deployments.
 * `excludeDeploymentId` is passed when editing, so a record does not
 * count against its own headroom check.
 */
export async function getResourceAllocation(
  resourceId: number,
  excludeDeploymentId?: number,
  /**
   * Pass the transaction handle when calling from inside db.transaction(), so
   * the read sees that transaction's uncommitted writes. Over a remote libSQL
   * connection a plain `db` read would not.
   */
  exec: Executor = db,
): Promise<AllocationBreakdown> {
  const rows = await exec
    .select({
      deploymentId: deployments.id,
      projectId: deployments.projectId,
      projectName: projects.projectName,
      clientName: clients.companyName,
      deploymentType: deployments.deploymentType,
      allocationPercentage: deployments.allocationPercentage,
    })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(
      excludeDeploymentId
        ? and(
            eq(deployments.resourceId, resourceId),
            eq(deployments.status, 'active'),
            ne(deployments.id, excludeDeploymentId),
          )
        : and(
            eq(deployments.resourceId, resourceId),
            eq(deployments.status, 'active'),
          ),
    )
    .all();

  const billable = rows
    .filter((r) => r.deploymentType === 'billable')
    .reduce((sum, r) => sum + r.allocationPercentage, 0);
  const shadow = rows
    .filter((r) => r.deploymentType === 'shadow')
    .reduce((sum, r) => sum + r.allocationPercentage, 0);
  const total = billable + shadow;

  return {
    billable,
    shadow,
    total,
    free: Math.max(0, 100 - total),
    entries: rows as AllocationBreakdown['entries'],
  };
}

export class AllocationError extends Error {
  constructor(
    message: string,
    public readonly headroom: number,
    public readonly requested: number,
  ) {
    super(message);
    this.name = 'AllocationError';
  }
}

/**
 * Throws when a new/updated deployment would push a resource past 100%.
 * Both billable and shadow deployments consume capacity.
 */
export async function assertAllocationHeadroom(
  resourceId: number,
  requested: number,
  excludeDeploymentId?: number,
  exec: Executor = db,
) {
  const current = await getResourceAllocation(resourceId, excludeDeploymentId, exec);
  if (current.total + requested > 100) {
    throw new AllocationError(
      `This resource has ${current.free}% allocation available, but ${requested}% was requested.`,
      current.free,
      requested,
    );
  }
}

/* ── Deployment billing maths ──────────────────────────────── */

/**
 * Superseded by `deploymentMoney()` in lib/utils — kept as a thin adapter so
 * the GST arithmetic has one home. Note what it no longer returns: a margin.
 * The old `billing − commission` figure ignored salary and is not a margin.
 */
export function deploymentBilling(d: { billingAmount: number; gstApplicable: boolean }) {
  const gst = d.gstApplicable ? d.billingAmount * GST_RATE : 0;
  return { base: d.billingAmount, gst, total: d.billingAmount + gst };
}

/* ── Agreements ────────────────────────────────────────────── */

/**
 * Walks `parent_agreement_id` back to v1, then returns the chain oldest-first.
 * Bounded by a visited set so a cyclic row cannot hang the request.
 */
export async function getAgreementChain(agreementId: number) {
  const chain: (typeof agreements.$inferSelect)[] = [];
  const seen = new Set<number>();

  // Walk backwards to the root.
  let cursor: number | null = agreementId;
  while (cursor !== null && !seen.has(cursor)) {
    seen.add(cursor);
    const row = await db.select().from(agreements).where(eq(agreements.id, cursor)).get();
    if (!row) break;
    chain.unshift(row);
    cursor = row.parentAgreementId;
  }

  // Walk forwards from the given id through any renewals made after it.
  let forward: number | null = agreementId;
  while (forward !== null) {
    const child: { id: number } | undefined = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(eq(agreements.parentAgreementId, forward))
      .get();
    if (!child || seen.has(child.id)) break;
    seen.add(child.id);
    const row = await db.select().from(agreements).where(eq(agreements.id, child.id)).get();
    if (!row) break;
    chain.push(row);
    forward = row.id;
  }

  return chain;
}

export async function getAgreementResources(agreementId: number) {
  return await db
    .select({
      id: agreementResources.id,
      resourceId: agreementResources.resourceId,
      billingAmount: agreementResources.billingAmount,
      resourceName: resources.name,
      designation: resources.designation,
    })
    .from(agreementResources)
    .innerJoin(resources, eq(agreementResources.resourceId, resources.id))
    .where(eq(agreementResources.agreementId, agreementId))
    .all();
}

/** Marks agreements whose end_date has passed as expired. Idempotent. */
export async function syncExpiredAgreements() {
  await db.update(agreements)
    .set({ status: 'expired' })
    .where(and(eq(agreements.status, 'active'), sql`${agreements.endDate} < ${today()}`))
    .run();
}

/* ── Dashboard aggregations ────────────────────────────────── */

export async function getDashboardSummary() {
  const totalResources =
    (await db.select({ c: sql<number>`count(*)` }).from(resources).get())?.c ?? 0;

  const allocationRows = await db
    .select({
      resourceId: deployments.resourceId,
      allocated: sql<number>`sum(${deployments.allocationPercentage})`,
    })
    .from(deployments)
    .where(eq(deployments.status, 'active'))
    .groupBy(deployments.resourceId)
    .all();

  const fullyDeployed = allocationRows.filter((r) => r.allocated >= 100).length;
  const partiallyDeployed = allocationRows.filter(
    (r) => r.allocated > 0 && r.allocated < 100,
  ).length;
  const available = totalResources - allocationRows.filter((r) => r.allocated > 0).length;

  // Grouped by currency as well as type: adding a dirham figure to a rupee one
  // produces a number that means nothing, so the rollup keeps them apart and
  // the UI renders each.
  const activeDeployments = await db
    .select({
      type: deployments.deploymentType,
      currency: deployments.currency,
      c: sql<number>`count(*)`,
      billing: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
      commission: sql<number>`coalesce(sum(${deployments.commissionAmount}), 0)`,
      gst: sql<number>`coalesce(sum(case when ${deployments.gstApplicable} = 1 then ${deployments.billingAmount} * ${GST_RATE} else 0 end), 0)`,
    })
    .from(deployments)
    .where(eq(deployments.status, 'active'))
    .groupBy(deployments.deploymentType, deployments.currency)
    .all();

  const billableRows = activeDeployments.filter((r) => r.type === 'billable');
  const shadowRows = activeDeployments.filter((r) => r.type === 'shadow');
  const countOf = (rows: typeof activeDeployments) =>
    rows.reduce((n, r) => n + r.c, 0);

  const activeProjects =
    (await db
      .select({ c: sql<number>`count(distinct ${deployments.projectId})` })
      .from(deployments)
      .where(eq(deployments.status, 'active'))
      .get())?.c ?? 0;

  const activeClients =
    (await db
      .select({ c: sql<number>`count(distinct ${projects.clientId})` })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .where(eq(deployments.status, 'active'))
      .get())?.c ?? 0;

  return {
    totalResources,
    fullyDeployed,
    partiallyDeployed,
    available,
    billableDeployments: countOf(billableRows),
    shadowDeployments: countOf(shadowRows),
    activeProjects,
    activeClients,
    monthlyBilling: sumByCurrency(
      billableRows.map((r) => ({ currency: r.currency, amount: r.billing })),
    ),
    monthlyCommission: sumByCurrency(
      billableRows.map((r) => ({ currency: r.currency, amount: r.commission })),
    ),
    monthlyGst: sumByCurrency(
      billableRows.map((r) => ({ currency: r.currency, amount: r.gst })),
    ),
    margin: await getMonthlyMargin(),
  };
}

export type MonthlyMargin = {
  /** INR margin across every active billable INR deployment with a CTC. */
  amount: number;
  /** Deployments the figure rests on, and the ones it could not include. */
  covered: number;
  needsRate: number;
  noCtc: number;
  /** What the active shadows cost each month, in INR. */
  shadowCost: number;
};

/**
 * The headline margin, computed per deployment with the shared formula and
 * summed — never from grouped totals, because allocation and the effective
 * CTC are per row.
 *
 * Rupees only. A deployment billing in AED or USD contributes nothing here
 * and is counted in `needsRate` so the screen can say how much of the book
 * the figure actually rests on, the same way pipeline value carries a
 * coverage caveat.
 */
export async function getMonthlyMargin(): Promise<MonthlyMargin> {
  const rows = await db
    .select({
      billingAmount: deployments.billingAmount,
      commissionAmount: deployments.commissionAmount,
      operationsOverhead: deployments.operationsOverhead,
      gstApplicable: deployments.gstApplicable,
      allocationPercentage: deployments.allocationPercentage,
      currency: deployments.currency,
      deploymentType: deployments.deploymentType,
      currentCtc: resources.currentCtc,
      revisedCtc: resources.revisedCtc,
      revisedEffectiveFrom: resources.revisedEffectiveFrom,
    })
    .from(deployments)
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .where(eq(deployments.status, 'active'))
    .all();

  const out: MonthlyMargin = { amount: 0, covered: 0, needsRate: 0, noCtc: 0, shadowCost: 0 };
  for (const r of rows) {
    const m = deploymentMoney({ ...r, annualCtc: effectiveCtc(r) });
    if (m.isCost) {
      out.shadowCost += m.ctcCost ?? 0;
      continue;
    }
    if (m.margin == null) {
      if (m.marginNote === 'needs-rate') out.needsRate++;
      else out.noCtc++;
      continue;
    }
    out.amount += m.margin;
    out.covered++;
  }
  return out;
}

export async function getInvoiceSummary() {
  const rows = await db
    .select({
      status: invoices.status,
      currency: invoices.currency,
      c: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${invoices.amount} + ${invoices.gstAmount}), 0)`,
    })
    .from(invoices)
    .groupBy(invoices.status, invoices.currency)
    .all();

  const byStatus: Record<string, { count: number; total: MoneyByCurrency }> = {};
  for (const r of rows) {
    const entry = (byStatus[r.status] ??= { count: 0, total: [] });
    entry.count += r.c;
    entry.total = sumByCurrency([
      ...entry.total.map((t) => ({ currency: t.currency as string, amount: t.amount })),
      { currency: r.currency, amount: r.total },
    ]);
  }

  const overdueRows = await db
    .select({
      currency: invoices.currency,
      c: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${invoices.amount} + ${invoices.gstAmount}), 0)`,
    })
    .from(invoices)
    .where(
      and(
        inArray(invoices.status, ['raised', 'pending_collection']),
        sql`${invoices.dueDate} is not null and ${invoices.dueDate} < ${today()}`,
      ),
    )
    .groupBy(invoices.currency)
    .all();

  return {
    byStatus,
    overdueCount: overdueRows.reduce((n, r) => n + r.c, 0),
    overdueAmount: sumByCurrency(
      overdueRows.map((r) => ({ currency: r.currency, amount: r.total })),
    ),
    // Raised and pending-collection are both money owed to us; they are folded
    // together per currency rather than into one figure.
    outstandingAmount: sumByCurrency([
      ...(byStatus.raised?.total ?? []),
      ...(byStatus.pending_collection?.total ?? []),
    ]),
  };
}

export async function getResourceUtilisation() {
  const all = await db
    .select({
      id: resources.id,
      name: resources.name,
      designation: resources.designation,
      // For the deployment form's margin preview. The effective figure is
      // resolved client-side with the same helper the detail page uses.
      currentCtc: resources.currentCtc,
      revisedCtc: resources.revisedCtc,
      revisedEffectiveFrom: resources.revisedEffectiveFrom,
    })
    .from(resources)
    .orderBy(resources.name)
    .all();

  const rows = await db
    .select({
      resourceId: deployments.resourceId,
      type: deployments.deploymentType,
      allocated: sql<number>`sum(${deployments.allocationPercentage})`,
    })
    .from(deployments)
    .where(eq(deployments.status, 'active'))
    .groupBy(deployments.resourceId, deployments.deploymentType)
    .all();

  return all
    .map((r) => {
      const billable = rows.find(
        (x) => x.resourceId === r.id && x.type === 'billable',
      )?.allocated ?? 0;
      const shadow = rows.find(
        (x) => x.resourceId === r.id && x.type === 'shadow',
      )?.allocated ?? 0;
      return {
        ...r,
        billable,
        shadow,
        total: billable + shadow,
        free: Math.max(0, 100 - billable - shadow),
      };
    })
    .sort((a, b) => b.total - a.total);
}

export async function getBillingByClient() {
  const where = and(
    eq(deployments.status, 'active'),
    eq(deployments.deploymentType, 'billable'),
  );

  // Two queries on purpose. Billing has to be grouped by currency, but
  // headcount must NOT be: count(distinct resource) per currency group and
  // then combined is wrong either way — summing double-counts anyone deployed
  // to the same client in two currencies, and taking the max silently drops
  // the people in the smaller group.
  const [billingRows, headcountRows] = await Promise.all([
    db
      .select({
        clientId: clients.id,
        clientName: clients.companyName,
        currency: deployments.currency,
        billing: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where)
      .groupBy(clients.id, deployments.currency)
      .all(),
    db
      .select({
        clientId: clients.id,
        headcount: sql<number>`count(distinct ${deployments.resourceId})`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(where)
      .groupBy(clients.id)
      .all(),
  ]);

  const byClient = new Map<
    number,
    { clientId: number; clientName: string; rows: { currency: string; amount: number }[] }
  >();
  for (const r of billingRows) {
    const entry = byClient.get(r.clientId) ?? {
      clientId: r.clientId,
      clientName: r.clientName,
      rows: [],
    };
    entry.rows.push({ currency: r.currency, amount: r.billing });
    byClient.set(r.clientId, entry);
  }

  return [...byClient.values()]
    .map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      billing: sumByCurrency(c.rows),
      largest: c.rows.reduce((a, b) => (b.amount > a.amount ? b : a)),
      headcount: headcountRows.find((h) => h.clientId === c.clientId)?.headcount ?? 0,
    }))
    .sort((a, b) => b.largest.amount - a.largest.amount);
}

export async function getSkillDistribution() {
  return await db
    .select({
      skill: sql<string>`coalesce(nullif(${resources.primarySkill}, ''), 'Unassigned')`,
      count: sql<number>`count(*)`,
    })
    .from(resources)
    .groupBy(sql`coalesce(nullif(${resources.primarySkill}, ''), 'Unassigned')`)
    .orderBy(desc(sql`count(*)`))
    .all();
}

export async function getEndingSoon(days = 30) {
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return await db
    .select({
      id: deployments.id,
      resourceName: resources.name,
      projectName: projects.projectName,
      clientName: clients.companyName,
      deploymentType: deployments.deploymentType,
      allocationPercentage: deployments.allocationPercentage,
      endDate: deployments.endDate,
      billingAmount: deployments.billingAmount,
    })
    .from(deployments)
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(
      and(
        eq(deployments.status, 'active'),
        sql`${deployments.endDate} is not null`,
        sql`${deployments.endDate} <= ${cutoff}`,
      ),
    )
    .orderBy(deployments.endDate)
    .all();
}

/* ── Pipeline (M8) ─────────────────────────────────────────── */

export function newShareToken() {
  return crypto.randomBytes(16).toString('hex');
}

/** Candidates counted as filling a position. */
const FILLED_STATUSES = ['selected', 'offered', 'joined'] as const;

/**
 * When each opportunity last changed stage, for "days in this stage".
 *
 * Read from the history table rather than a column on the opportunity: every
 * move has been logged with a timestamp since Phase 2, so the answer already
 * exists and a stored column could only drift from it.
 *
 * An opportunity with no history has never moved — the caller falls back to
 * its creation date, which is the honest reading: it has sat in `requirement`
 * since the day it was logged.
 */
export async function getStageSince() {
  return await db
    .select({
      opportunityId: opportunityStageHistory.opportunityId,
      since: sql<string>`max(${opportunityStageHistory.createdAt})`,
    })
    .from(opportunityStageHistory)
    .groupBy(opportunityStageHistory.opportunityId)
    .all();
}

/** Per-opportunity candidate counts, used across list and board views. */
export async function getOpportunityCandidateCounts() {
  return await db
    .select({
      opportunityId: opportunityCandidates.opportunityId,
      mapped: sql<number>`count(*)`,
      filled: sql<number>`sum(case when ${opportunityCandidates.status} in ('selected','offered','joined') then 1 else 0 end)`,
      inInterview: sql<number>`sum(case when ${opportunityCandidates.status} = 'interview' then 1 else 0 end)`,
    })
    .from(opportunityCandidates)
    .groupBy(opportunityCandidates.opportunityId)
    .all();
}

export async function getPipelineSummary() {
  const rows = await db
    .select({
      stage: opportunities.stage,
      count: sql<number>`count(*)`,
      positions: sql<number>`coalesce(sum(${opportunities.requiredCount}), 0)`,
    })
    .from(opportunities)
    .groupBy(opportunities.stage)
    .all();

  const byStage = Object.fromEntries(
    rows.map((r) => [r.stage, { count: r.count, positions: r.positions }]),
  ) as Record<string, { count: number; positions: number }>;

  const openStages = PIPELINE_STAGES as readonly string[];
  const open = rows.filter((r) => openStages.includes(r.stage));

  const filled =
    (await db
      .select({
        c: sql<number>`count(*)`,
      })
      .from(opportunityCandidates)
      .innerJoin(
        opportunities,
        eq(opportunityCandidates.opportunityId, opportunities.id),
      )
      .where(
        and(
          inArray(opportunities.stage, [...PIPELINE_STAGES]),
          inArray(opportunityCandidates.status, [...FILLED_STATUSES]),
        ),
      )
      .get())?.c ?? 0;

  // Won/lost over a rolling 90-day window, based on the closing stage move.
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const closed = await db
    .select({
      toStage: opportunityStageHistory.toStage,
      c: sql<number>`count(distinct ${opportunityStageHistory.opportunityId})`,
    })
    .from(opportunityStageHistory)
    .where(
      and(
        inArray(opportunityStageHistory.toStage, ['won', 'lost']),
        sql`${opportunityStageHistory.createdAt} >= ${cutoff}`,
      ),
    )
    .groupBy(opportunityStageHistory.toStage)
    .all();

  const followUpsDue =
    (await db
      .select({ c: sql<number>`count(*)` })
      .from(opportunities)
      .where(
        and(
          inArray(opportunities.stage, [...PIPELINE_STAGES]),
          sql`${opportunities.nextStepDate} is not null and ${opportunities.nextStepDate} <= ${today()}`,
        ),
      )
      .get())?.c ?? 0;

  return {
    byStage,
    openCount: open.reduce((s, r) => s + r.count, 0),
    openPositions: open.reduce((s, r) => s + r.positions, 0),
    filledPositions: filled,
    inInterview: byStage.interview?.count ?? 0,
    won90d: closed.find((c) => c.toStage === 'won')?.c ?? 0,
    lost90d: closed.find((c) => c.toStage === 'lost')?.c ?? 0,
    onHold: byStage.hold?.count ?? 0,
    followUpsDue,
  };
}

/** Open opportunities whose next-step date has arrived or passed. */
export async function getDueFollowUps() {
  return await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      companyName: opportunities.companyName,
      stage: opportunities.stage,
      nextStep: opportunities.nextStep,
      nextStepDate: opportunities.nextStepDate,
      requiredCount: opportunities.requiredCount,
      owner: opportunities.owner,
    })
    .from(opportunities)
    .where(
      and(
        inArray(opportunities.stage, [...PIPELINE_STAGES]),
        sql`${opportunities.nextStepDate} is not null and ${opportunities.nextStepDate} <= ${today()}`,
      ),
    )
    .orderBy(opportunities.nextStepDate)
    .all();
}

/**
 * The stage an opportunity sat on before it was put on hold, so resuming
 * returns it there rather than to the start of the pipeline.
 */
export async function getStageBeforeHold(
  opportunityId: number,
): Promise<string | null> {
  const row = await db
    .select({ fromStage: opportunityStageHistory.fromStage })
    .from(opportunityStageHistory)
    .where(
      and(
        eq(opportunityStageHistory.opportunityId, opportunityId),
        eq(opportunityStageHistory.toStage, 'hold'),
      ),
    )
    .orderBy(desc(opportunityStageHistory.id))
    .get();

  const from = row?.fromStage ?? null;
  return from && (PIPELINE_STAGES as readonly string[]).includes(from) ? from : null;
}

export async function getCandidateOpportunityCounts() {
  return await db
    .select({
      candidateId: opportunityCandidates.candidateId,
      mapped: sql<number>`count(*)`,
      active: sql<number>`sum(case when ${opportunityCandidates.status} not in ('rejected','withdrawn') then 1 else 0 end)`,
    })
    .from(opportunityCandidates)
    .groupBy(opportunityCandidates.candidateId)
    .all();
}

export async function getExpiringAgreements(days = 30) {
  const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  return await db
    .select({
      id: agreements.id,
      title: agreements.title,
      agreementNumber: agreements.agreementNumber,
      projectName: projects.projectName,
      clientName: clients.companyName,
      currency: agreements.currency,
      value: agreements.value,
      endDate: agreements.endDate,
      renewalVersion: agreements.renewalVersion,
    })
    .from(agreements)
    .innerJoin(projects, eq(agreements.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(eq(agreements.status, 'active'), sql`${agreements.endDate} <= ${cutoff}`))
    .orderBy(agreements.endDate)
    .all();
}

/**
 * Value-based pipeline KPIs for the dashboard.
 *
 * Won and lost "this month" come from opportunity_stage_history rather than
 * the opportunity's current stage: the history table has recorded every move
 * with a timestamp since Phase 2, so these figures have real history behind
 * them immediately instead of starting empty. Current stage alone could only
 * ever say "won at some point".
 */
export async function getPipelineValue() {
  const rows = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      currency: opportunities.currency,
      dealValue: opportunities.dealValue,
      budgetMin: opportunities.budgetMin,
      budgetMax: opportunities.budgetMax,
      requiredCount: opportunities.requiredCount,
    })
    .from(opportunities)
    .all();

  const openStages = PIPELINE_STAGES as readonly string[];
  const open = rows.filter((r) => openStages.includes(r.stage));

  // First day of the current month, as the YYYY-MM prefix the timestamps use.
  const monthPrefix = new Date().toISOString().slice(0, 7);
  const closures = await db
    .select({
      opportunityId: opportunityStageHistory.opportunityId,
      toStage: opportunityStageHistory.toStage,
    })
    .from(opportunityStageHistory)
    .where(
      and(
        inArray(opportunityStageHistory.toStage, ['won', 'lost']),
        sql`substr(${opportunityStageHistory.createdAt}, 1, 7) = ${monthPrefix}`,
      ),
    )
    .all();

  const byId = new Map(rows.map((r) => [r.id, r]));
  const closedThisMonth = (stage: 'won' | 'lost') =>
    closures
      .filter((c) => c.toStage === stage)
      .map((c) => byId.get(c.opportunityId))
      .filter((r): r is (typeof rows)[number] => Boolean(r));

  const wonRows = closedThisMonth('won');
  const lostRows = closedThisMonth('lost');
  const decided = wonRows.length + lostRows.length;

  return {
    open: valueSummary(open),
    weighted: valueSummary(open, { weighted: true }),
    wonThisMonth: valueSummary(wonRows),
    lostThisMonth: valueSummary(lostRows),
    // Of the deals actually decided this month, how many went our way. Null
    // when nothing closed, because 0% and "no data" are different claims.
    conversionRate: decided > 0 ? Math.round((wonRows.length / decided) * 100) : null,
    decidedThisMonth: decided,
  };
}

/* ── M25: recruiter dashboards ─────────────────────────────── */

/**
 * One recruiter's working picture, or the whole team's when userId is null.
 *
 * Everything keys on the attribution added in M21. Records written before that
 * carry no actor, so they surface under "unassigned" rather than being silently
 * attributed to whoever happens to be looking.
 */
/**
 * M42 — the requirement ids a TA is assigned to. One row per assignee, so
 * "mine" is a set membership rather than a column equality, and a requirement
 * with two TAs shows on both boards.
 */
export async function assignedOpportunityIds(userId: number): Promise<Set<number>> {
  const rows = await db
    .select({ id: opportunityAssignees.opportunityId })
    .from(opportunityAssignees)
    .where(eq(opportunityAssignees.userId, userId))
    .all();
  return new Set(rows.map((r) => r.id));
}

export async function getRecruiterBoard(userId: number | null) {
  const mine = userId === null ? undefined : userId;
  const assigned = mine === undefined ? null : await assignedOpportunityIds(mine);

  const opps = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      stage: opportunities.stage,
      requiredCount: opportunities.requiredCount,
      nextStep: opportunities.nextStep,
      nextStepDate: opportunities.nextStepDate,
    })
    .from(opportunities)
    .where(inArray(opportunities.stage, [...PIPELINE_STAGES]))
    .all();

  const owned = assigned === null ? opps : opps.filter((o) => assigned.has(o.id));

  const mappings = await db
    .select({
      id: opportunityCandidates.id,
      opportunityId: opportunityCandidates.opportunityId,
      status: opportunityCandidates.status,
      interviewDate: opportunityCandidates.interviewDate,
      feedback: opportunityCandidates.feedback,
      userId: opportunityCandidates.userId,
      statusChangedAt: opportunityCandidates.statusChangedAt,
      offeredAt: opportunityCandidates.offeredAt,
      expectedJoinDate: opportunityCandidates.expectedJoinDate,
      candidateName: candidates.name,
      title: opportunities.title,
    })
    .from(opportunityCandidates)
    .innerJoin(candidates, eq(opportunityCandidates.candidateId, candidates.id))
    .innerJoin(opportunities, eq(opportunityCandidates.opportunityId, opportunities.id))
    .all();

  // M30-2 — rounds that are scheduled but have not happened, soonest first.
  // Outcome null is the definition of "not held" (see candidateInterviews).
  const upcoming = await db
    .select({
      id: candidateInterviews.id,
      mappingId: candidateInterviews.opportunityCandidateId,
      round: candidateInterviews.round,
      mode: candidateInterviews.mode,
      scheduledAt: candidateInterviews.scheduledAt,
    })
    .from(candidateInterviews)
    .where(and(isNull(candidateInterviews.outcome), isNotNull(candidateInterviews.scheduledAt)))
    .orderBy(candidateInterviews.scheduledAt)
    .all();

  const ownedIds = new Set(owned.map((o) => o.id));
  const myMappings =
    mine === undefined
      ? mappings
      : mappings.filter((m) => m.userId === mine || ownedIds.has(m.opportunityId));

  const pendingReferrals = await db
    .select({
      id: referrals.id,
      opportunityId: referrals.opportunityId,
      candidateName: referrals.candidateName,
      kind: referrals.kind,
      title: opportunities.title,
    })
    .from(referrals)
    .innerJoin(opportunities, eq(referrals.opportunityId, opportunities.id))
    .where(eq(referrals.status, 'new'))
    .all();

  const today_ = today();

  return {
    requirements: owned,
    // The morning list: things with a name on them that nobody has moved.
    followUpsDue: owned.filter((o) => o.nextStepDate && o.nextStepDate <= today_),
    // Mapped but never put in front of the client.
    notSubmitted: myMappings.filter((m) => m.status === 'mapped'),
    // Interviewed with nothing written down — the most commonly dropped step.
    interviewsUnlogged: myMappings.filter(
      (m) => m.status === 'interview' && m.interviewDate && !m.feedback,
    ),
    // M30-2 — the next few days, and anything already overdue with no outcome.
    interviewsUpcoming: upcoming
      .filter((u) => myMappings.some((m) => m.id === u.mappingId))
      .filter((u) => u.scheduledAt! <= addDays(today_, 3))
      .map((u) => ({ ...u, mapping: myMappings.find((m) => m.id === u.mappingId)! })),
    // M30-3 — live and untouched for a fortnight. A null stamp (rows the
    // migration has not reached) is treated as never moved, which is the
    // truthful reading rather than the flattering one.
    stalled: myMappings.filter(
      (m) =>
        !['rejected', 'withdrawn', 'joined'].includes(m.status) &&
        (m.statusChangedAt ?? '0000-00-00') <= addDays(today_, -STALL_DAYS),
    ),
    // M30-5 — an offer out, nobody joined yet. Overdue when the expected
    // date has passed; "no date" is its own warning.
    offersOpen: myMappings
      .filter((m) => m.status === 'offered')
      .map((m) => ({
        ...m,
        overdue: Boolean(m.expectedJoinDate && m.expectedJoinDate < today_),
        daysToJoin: m.expectedJoinDate ? daysBetween(today_, m.expectedJoinDate) : null,
      })),
    inboxWaiting:
      assigned === null
        ? pendingReferrals
        : pendingReferrals.filter((r) => assigned.has(r.opportunityId)),
    counts: {
      submitted: myMappings.filter((m) =>
        ['submitted', 'interview', 'selected', 'offered', 'joined'].includes(m.status),
      ).length,
      interviewing: myMappings.filter((m) => m.status === 'interview').length,
      offered: myMappings.filter((m) => ['offered', 'joined'].includes(m.status)).length,
      joined: myMappings.filter((m) => m.status === 'joined').length,
      positions: owned.reduce((n, o) => n + o.requiredCount, 0),
    },
  };
}

/** Per-recruiter roll-up for a team lead, plus what nobody owns. */
export async function getTeamBoard() {
  const team = await db
    .select({ id: users.id, name: users.name, isTeamLead: users.isTeamLead })
    .from(users)
    .where(and(eq(users.role, 'ta'), eq(users.active, true)))
    .orderBy(users.name)
    .all();

  const perPerson = await Promise.all(
    team.map(async (u) => ({ user: u, board: await getRecruiterBoard(u.id) })),
  );

  // Work that predates attribution, or belongs to a name with no account.
  const all = await getRecruiterBoard(null);
  const ownedByTeam = new Set(
    perPerson.flatMap((p) => p.board.requirements.map((r) => r.id)),
  );
  const unassigned = all.requirements.filter((r) => !ownedByTeam.has(r.id));

  return { perPerson, unassigned, totals: all.counts };
}

/* ── M26/M27: the applicant queue ──────────────────────────── */

export type ApplicationRow = {
  id: number;
  opportunityId: number;
  requirementTitle: string;
  companyName: string;
  /** The TAs assigned to the requirement, for display. */
  assigneeNames: string[];
  kind: 'referral' | 'application';
  status: 'new' | 'accepted' | 'dismissed';
  candidateName: string;
  candidateEmail: string | null;
  candidateMobile: string | null;
  referrerName: string;
  referrerEmail: string | null;
  experienceYears: number | null;
  noticePeriodDays: number | null;
  currentCtc: number | null;
  expectedCtc: number | null;
  notes: string | null;
  contactStatus: 'not_contacted' | 'attempted' | 'reached' | 'unreachable';
  contactNote: string | null;
  lastContactedAt: string | null;
  contactedByName: string | null;
  convertedCandidateId: number | null;
  createdAt: string;
  /** Duplicate signals, computed below rather than stored. */
  alreadyInPool: boolean;
  otherApplications: number;
};

/**
 * Everything the public job page has brought in, as one queue.
 *
 * The rows live in `referrals` — the staging table an unauthenticated form is
 * allowed to write to — and this is the only place they are read as a list
 * rather than one requirement at a time.
 *
 * The duplicate flags are computed here, in one pass over two small extra
 * queries, rather than per row in the UI: cold-calling someone a colleague
 * placed last month is the failure mode this exists to prevent, and it only
 * prevents it if the flag is on screen before anybody dials.
 */
export async function getApplicationQueue(): Promise<ApplicationRow[]> {
  const caller = alias(users, 'caller_user');

  const rows = await db
    .select({
      id: referrals.id,
      opportunityId: referrals.opportunityId,
      requirementTitle: opportunities.title,
      companyName: opportunities.companyName,
      kind: referrals.kind,
      status: referrals.status,
      candidateName: referrals.candidateName,
      candidateEmail: referrals.candidateEmail,
      candidateMobile: referrals.candidateMobile,
      referrerName: referrals.referrerName,
      referrerEmail: referrals.referrerEmail,
      experienceYears: referrals.experienceYears,
      noticePeriodDays: referrals.noticePeriodDays,
      currentCtc: referrals.currentCtc,
      expectedCtc: referrals.expectedCtc,
      notes: referrals.notes,
      contactStatus: referrals.contactStatus,
      contactNote: referrals.contactNote,
      lastContactedAt: referrals.lastContactedAt,
      contactedByName: caller.name,
      convertedCandidateId: referrals.convertedCandidateId,
      createdAt: referrals.createdAt,
    })
    .from(referrals)
    .innerJoin(opportunities, eq(referrals.opportunityId, opportunities.id))
    .leftJoin(caller, eq(referrals.contactedByUserId, caller.id))
    .orderBy(desc(referrals.id))
    .all();

  // One query for every assignee on every requirement in the queue.
  const assigneeRows = rows.length
    ? await db
        .select({ opportunityId: opportunityAssignees.opportunityId, name: users.name })
        .from(opportunityAssignees)
        .innerJoin(users, eq(opportunityAssignees.userId, users.id))
        .where(inArray(opportunityAssignees.opportunityId, [...new Set(rows.map((r) => r.opportunityId))]))
        .all()
    : [];

  // Matched on email and mobile, lowercased and stripped of formatting — the
  // same person rarely types their number the same way twice.
  const pool = await db
    .select({ email: candidates.email, mobile: candidates.mobile })
    .from(candidates)
    .all();

  const poolKeys = new Set<string>();
  for (const c of pool) {
    for (const k of contactKeys(c.email, c.mobile)) poolKeys.add(k);
  }

  const seenElsewhere = new Map<string, number>();
  for (const r of rows) {
    for (const k of contactKeys(r.candidateEmail, r.candidateMobile)) {
      seenElsewhere.set(k, (seenElsewhere.get(k) ?? 0) + 1);
    }
  }

  return rows.map((r) => {
    const keys = contactKeys(r.candidateEmail, r.candidateMobile);
    // Every key counts this row itself, so "elsewhere" is the max minus one.
    const others = keys.reduce((n, k) => Math.max(n, seenElsewhere.get(k) ?? 0), 0);
    return {
      ...r,
      assigneeNames: assigneeRows.filter((a) => a.opportunityId === r.opportunityId).map((a) => a.name),
      alreadyInPool: keys.some((k) => poolKeys.has(k)),
      otherApplications: Math.max(0, others - 1),
    };
  });
}

/** Normalised contact keys for duplicate matching. Blank fields yield none. */
function contactKeys(email: string | null, mobile: string | null): string[] {
  const keys: string[] = [];
  const e = (email ?? '').trim().toLowerCase();
  if (e) keys.push(`e:${e}`);
  // Last 10 digits: tolerates +91, 0-prefixes, spaces and hyphens.
  const digits = (mobile ?? '').replace(/\D/g, '');
  if (digits.length >= 10) keys.push(`m:${digits.slice(-10)}`);
  return keys;
}

export type ApplicantAlert = {
  /** Awaiting a decision, in this user's scope. */
  pending: number;
  /** Of those, arrived since they last opened the queue. */
  fresh: number;
  /** Awaiting a decision and nobody has called yet. */
  uncalled: number;
};

/**
 * The badge. Scoped to what this user is responsible for, so a recruiter is
 * not nagged about somebody else's requirement.
 *
 * `mine === undefined` means no scoping — admin, management, and a team lead
 * looking at the whole team.
 */
export async function getApplicantAlert(
  mine: number | undefined,
  seenAt: string | null,
): Promise<ApplicantAlert> {
  const rows = await db
    .select({
      opportunityId: referrals.opportunityId,
      createdAt: referrals.createdAt,
      contactStatus: referrals.contactStatus,
    })
    .from(referrals)
    .innerJoin(opportunities, eq(referrals.opportunityId, opportunities.id))
    .where(eq(referrals.status, 'new'))
    .all();

  const assigned = mine === undefined ? null : await assignedOpportunityIds(mine);
  const scoped = assigned === null ? rows : rows.filter((r) => assigned.has(r.opportunityId));

  return {
    pending: scoped.length,
    // A null watermark means this person has never opened the queue, so
    // everything waiting is new to them — which is the truthful answer, not
    // merely the convenient one.
    fresh: scoped.filter((r) => seenAt === null || r.createdAt > seenAt).length,
    uncalled: scoped.filter((r) => r.contactStatus === 'not_contacted').length,
  };
}

/** Active TA accounts, for the lead's member selector. Names only — no boards. */
export async function getTeamMembers() {
  return db
    .select({ id: users.id, name: users.name, isTeamLead: users.isTeamLead })
    .from(users)
    .where(and(eq(users.role, 'ta'), eq(users.active, true)))
    .orderBy(users.name)
    .all();
}

/* ── M30-4: source effectiveness ───────────────────────────── */

export type SourceRow = {
  source: string;
  candidates: number;
  /** Distinct candidates put forward for at least one requirement. */
  mapped: number;
  /** Distinct candidates who reached the client — submitted or beyond. */
  submitted: number;
  joined: number;
};

/**
 * Which channel actually produces hires.
 *
 * Every field it needs has been captured since M9 and nothing reported on it.
 * Counted per distinct candidate, not per mapping — a person on four
 * requirements is one sourced person, and a channel does not get four times
 * the credit for them. Sorted by joins, then by volume, so the channel that
 * delivers sits at the top even when it is not the biggest.
 */
export async function getSourceEffectiveness(): Promise<SourceRow[]> {
  const rows = await db
    .select({
      source: candidates.source,
      candidates: sql<number>`count(distinct ${candidates.id})`,
      mapped: sql<number>`count(distinct ${opportunityCandidates.candidateId})`,
      submitted: sql<number>`count(distinct case when ${opportunityCandidates.status} in ('submitted','interview','selected','offered','joined') then ${opportunityCandidates.candidateId} end)`,
      joined: sql<number>`count(distinct case when ${opportunityCandidates.status} = 'joined' then ${opportunityCandidates.candidateId} end)`,
    })
    .from(candidates)
    .leftJoin(opportunityCandidates, eq(opportunityCandidates.candidateId, candidates.id))
    .groupBy(candidates.source)
    .all();

  return rows
    .map((r) => ({
      source: r.source,
      candidates: Number(r.candidates),
      mapped: Number(r.mapped),
      submitted: Number(r.submitted),
      joined: Number(r.joined),
    }))
    .sort((a, b) => b.joined - a.joined || b.candidates - a.candidates);
}

/** Active accounts of one team role — id and name only, for owner pickers. */
export async function getTeamOptions(role: 'ta' | 'leadgen' | 'sales') {
  return db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.role, role), eq(users.active, true)))
    .orderBy(users.name)
    .all();
}

/* ── M43 / M45: leadgen and sales boards ───────────────────── */

export type OwnerKind = 'lead' | 'sales';

export type OwnerBoardRow = {
  id: number;
  title: string;
  companyName: string;
  stage: string;
  priority: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  createdAt: string;
  requiredCount: number;
  currency: string;
  budgetMin: number | null;
  budgetMax: number | null;
  dealValue: number | null;
  leadOwnerUserId: number | null;
  salesOwnerUserId: number | null;
  /** Latest stage-history timestamp — when it last moved. */
  lastMovedAt: string | null;
};

const HANDED_ON = ['candidate_mapping', 'interview', 'agreement', 'won'];

/**
 * The board for one owner kind. `userId` null means the whole team — a head
 * looking across, or Admin. Leadgen sees everything they own including what
 * has been handed on (read-only, so they can see what became of it); sales
 * sees what they own from budgeting onward.
 */
export async function getOwnerBoard(kind: OwnerKind, userId: number | null) {
  const col = kind === 'lead' ? opportunities.leadOwnerUserId : opportunities.salesOwnerUserId;
  const rows = await db
    .select({
      id: opportunities.id,
      title: opportunities.title,
      companyName: opportunities.companyName,
      stage: opportunities.stage,
      priority: opportunities.priority,
      nextStep: opportunities.nextStep,
      nextStepDate: opportunities.nextStepDate,
      createdAt: opportunities.createdAt,
      requiredCount: opportunities.requiredCount,
      currency: opportunities.currency,
      budgetMin: opportunities.budgetMin,
      budgetMax: opportunities.budgetMax,
      dealValue: opportunities.dealValue,
      leadOwnerUserId: opportunities.leadOwnerUserId,
      salesOwnerUserId: opportunities.salesOwnerUserId,
      lastMovedAt: sql<string | null>`(select max(created_at) from opportunity_stage_history h where h.opportunity_id = ${opportunities.id})`,
    })
    .from(opportunities)
    .where(userId === null ? isNotNull(col) : eq(col, userId))
    .orderBy(desc(opportunities.id))
    .all();

  const today_ = today();
  const monthStart = today_.slice(0, 7) + '-01';
  const ninetyAgo = addDays(today_, -90);
  const open = rows.filter((r) => !['won', 'lost'].includes(r.stage));

  const counts =
    kind === 'lead'
      ? {
          addedThisMonth: rows.filter((r) => r.createdAt.slice(0, 10) >= monthStart).length,
          inRequirement: rows.filter((r) => r.stage === 'requirement').length,
          inQualification: rows.filter((r) => r.stage === 'qualification').length,
          inBudgeting: rows.filter((r) => r.stage === 'budgeting').length,
          handedOn: rows.filter((r) => HANDED_ON.includes(r.stage)).length,
          lost: rows.filter((r) => r.stage === 'lost').length,
        }
      : {
          inMapping: rows.filter((r) => r.stage === 'candidate_mapping').length,
          inInterview: rows.filter((r) => r.stage === 'interview').length,
          inAgreement: rows.filter((r) => r.stage === 'agreement').length,
          won90: rows.filter((r) => r.stage === 'won' && (r.lastMovedAt ?? '') >= ninetyAgo).length,
          lost90: rows.filter((r) => r.stage === 'lost' && (r.lastMovedAt ?? '') >= ninetyAgo).length,
          inFlight: valueSummary(open.filter((r) => !['requirement', 'qualification'].includes(r.stage))),
        };

  return {
    requirements: rows,
    open,
    counts,
    // The morning list, by kind.
    followUpsDue: open.filter((r) => r.nextStepDate && r.nextStepDate <= today_),
    noNextStep: open.filter((r) => !r.nextStep && !r.nextStepDate),
    // Sat still for a fortnight, by the stage-history clock.
    stalled: open.filter((r) => (r.lastMovedAt ?? r.createdAt).slice(0, 10) <= addDays(today_, -STALL_DAYS)),
    wonNotConverted: rows.filter((r) => r.stage === 'won'),
  };
}

/** A head's roll-up: every member of the role, with their board. */
export async function getOwnerTeamBoard(kind: OwnerKind) {
  const role = kind === 'lead' ? 'leadgen' : 'sales';
  const team = await db
    .select({ id: users.id, name: users.name, isTeamLead: users.isTeamLead })
    .from(users)
    .where(and(eq(users.role, role), eq(users.active, true)))
    .orderBy(users.name)
    .all();
  const perPerson = await Promise.all(
    team.map(async (u) => ({ user: u, board: await getOwnerBoard(kind, u.id) })),
  );
  // What nobody of this kind owns yet — for leadgen, that is the assignment queue.
  const col = kind === 'lead' ? opportunities.leadOwnerUserId : opportunities.salesOwnerUserId;
  const unowned = await db
    .select({ id: opportunities.id, title: opportunities.title, companyName: opportunities.companyName, stage: opportunities.stage })
    .from(opportunities)
    .where(and(isNull(col), inArray(opportunities.stage, [...PIPELINE_STAGES])))
    .orderBy(desc(opportunities.id))
    .all();
  return { team, perPerson, unowned };
}
