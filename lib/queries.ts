import 'server-only';
import { and, eq, ne, sql, desc, inArray } from 'drizzle-orm';
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
  PIPELINE_STAGES,
} from './schema';
import {
  GST_RATE,
  today,
  sumByCurrency,
  valueSummary,
  type MoneyByCurrency,
} from './utils';
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

export function deploymentBilling(d: {
  billingAmount: number;
  commissionAmount: number;
  gstApplicable: boolean;
}) {
  const gst = d.gstApplicable ? d.billingAmount * GST_RATE : 0;
  return {
    base: d.billingAmount,
    gst,
    total: d.billingAmount + gst,
    margin: d.billingAmount - d.commissionAmount,
  };
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
  };
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
    .select({ id: resources.id, name: resources.name, designation: resources.designation })
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
