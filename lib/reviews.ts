import 'server-only';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { z } from 'zod';
import { db } from './db';
import {
  accountReviews,
  clients,
  deployments,
  opportunities,
  performanceReviews,
  performanceReviewScores,
  projects,
  resources,
  resourceSkills,
  reviewCriteria,
  skills,
  timesheetEntries,
  users,
} from './schema';
import type { Viewer } from './session';
import {
  averageScore,
  completion,
  dueInPeriod,
  isReviewEditable,
  normaliseSkillName,
  periodBounds,
  reviewTransition,
  shiftPeriod,
  skillKey,
  submitError,
  type AccountRating,
  type Completion,
  type ReviewAction,
  type ReviewStatus,
} from './review-rules';
import { periodSummary, type PeriodSummary } from './timesheet-rules';
import { holidaysBetween } from './timesheets';
import type {
  accountReviewSchema,
  performanceReviewSchema,
  resourceSkillsSchema,
  reviewCriterionUpdateSchema,
  skillUpdateSchema,
} from './validations';

/**
 * Server-side reads and writes for M67. The rules are in lib/review-rules.ts;
 * this file decides who may see which rows and builds every response.
 *
 * Two rules hold everywhere below:
 *
 * - Every shape is built field by field. Deployments carry billing,
 *   commission and overhead and resources carry CTC; none of those is
 *   selected here, so none can leak to the Resource Manager or Sales.
 * - Sales sees account reviews only, only approved ones, and only for its
 *   own clients (Q5). Anything outside that answers exactly as a missing row
 *   does, so ids cannot be probed.
 */

export class ReviewError extends Error {
  constructor(
    message: string,
    readonly status: number = 422,
  ) {
    super(message);
  }
}

const notFound = (what: string) => new ReviewError(`${what} not found`, 404);

const now = () => new Date().toISOString();

/** Admin, Management and the Resource Manager see every review. */
function seesAllReviews(v: Pick<Viewer, 'role'>): boolean {
  return v.role === 'admin' || v.role === 'management' || v.role === 'resource_manager';
}

/* ── Shared lookups ────────────────────────────────────────── */

type DeploymentRow = {
  id: number;
  resourceId: number;
  resourceName: string;
  designation: string | null;
  projectName: string;
  clientId: number;
  clientName: string;
  startDate: string;
  endDate: string | null;
  deploymentType: string;
};

/** Deployments overlapping a month, with names only — no money field is selected. */
async function deploymentsIn(period: string, where?: ReturnType<typeof eq>): Promise<DeploymentRow[]> {
  const { from, to } = periodBounds(period);
  return db
    .select({
      id: deployments.id,
      resourceId: resources.id,
      resourceName: resources.name,
      designation: resources.designation,
      projectName: projects.projectName,
      clientId: clients.id,
      clientName: clients.companyName,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      deploymentType: deployments.deploymentType,
    })
    .from(deployments)
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(lte(deployments.startDate, to), or(isNull(deployments.endDate), gte(deployments.endDate, from)), where))
    .orderBy(asc(clients.companyName), asc(resources.name))
    .all();
}

/** Average score per review id, from the stored scores. Null when unscored. */
async function averagesFor(reviewIds: number[]): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  if (reviewIds.length === 0) return out;
  const rows = await db
    .select({ reviewId: performanceReviewScores.reviewId, score: performanceReviewScores.score })
    .from(performanceReviewScores)
    .where(inArray(performanceReviewScores.reviewId, reviewIds))
    .all();
  const byReview = new Map<number, number[]>();
  for (const r of rows) {
    const list = byReview.get(r.reviewId) ?? [];
    list.push(r.score);
    byReview.set(r.reviewId, list);
  }
  for (const id of reviewIds) out.set(id, averageScore(byReview.get(id) ?? []));
  return out;
}

/* ── The month tracker (G-RM-05) ───────────────────────────── */

export type TrackerPerformanceRow = {
  deploymentId: number;
  resourceName: string;
  designation: string | null;
  projectName: string;
  clientName: string;
  deploymentType: string;
  reviewId: number | null;
  status: ReviewStatus | null;
  average: number | null;
  clientFeedback: boolean;
};

export type TrackerAccountRow = {
  clientId: number;
  clientName: string;
  deployed: number;
  reviewId: number | null;
  status: ReviewStatus | null;
  rating: AccountRating | null;
};

export type Tracker = {
  period: string;
  performance: TrackerPerformanceRow[];
  accounts: TrackerAccountRow[];
  performanceCompletion: Completion;
  accountCompletion: Completion;
};

/** Every review due in a month and how far each has got. Admin, Management, Resource Manager. */
export async function reviewTracker(period: string): Promise<Tracker> {
  const due = dueInPeriod(await deploymentsIn(period), period);

  const perf = await db
    .select({
      id: performanceReviews.id,
      deploymentId: performanceReviews.deploymentId,
      status: performanceReviews.status,
      clientFeedback: performanceReviews.clientFeedback,
    })
    .from(performanceReviews)
    .where(eq(performanceReviews.period, period))
    .all();
  const perfByDeployment = new Map(perf.map((r) => [r.deploymentId, r]));
  const averages = await averagesFor(perf.map((r) => r.id));

  const acct = await db
    .select({ id: accountReviews.id, clientId: accountReviews.clientId, status: accountReviews.status, rating: accountReviews.rating })
    .from(accountReviews)
    .where(eq(accountReviews.period, period))
    .all();
  const acctByClient = new Map(acct.map((r) => [r.clientId, r]));

  const performance: TrackerPerformanceRow[] = due.deployments.map((d) => {
    const r = perfByDeployment.get(d.id);
    return {
      deploymentId: d.id,
      resourceName: d.resourceName,
      designation: d.designation,
      projectName: d.projectName,
      clientName: d.clientName,
      deploymentType: d.deploymentType,
      reviewId: r?.id ?? null,
      status: r?.status ?? null,
      average: r ? (averages.get(r.id) ?? null) : null,
      clientFeedback: Boolean(r?.clientFeedback),
    };
  });

  const clientNames = new Map(due.deployments.map((d) => [d.clientId, d.clientName]));
  const accounts: TrackerAccountRow[] = due.clientIds
    .map((clientId) => {
      const r = acctByClient.get(clientId);
      return {
        clientId,
        clientName: clientNames.get(clientId) ?? '',
        deployed: new Set(due.deployments.filter((d) => d.clientId === clientId).map((d) => d.resourceId)).size,
        reviewId: r?.id ?? null,
        status: r?.status ?? null,
        rating: r?.rating ?? null,
      };
    })
    .sort((a, b) => a.clientName.localeCompare(b.clientName));

  return {
    period,
    performance,
    accounts,
    performanceCompletion: completion(
      due.deployments.map((d) => d.id),
      new Map(perf.map((r) => [r.deploymentId, r.status])),
    ),
    accountCompletion: completion(due.clientIds, new Map(acct.map((r) => [r.clientId, r.status]))),
  };
}

/* ── Performance reviews ───────────────────────────────────── */

/** Opens the month's review for a deployment, or returns the one already open. */
export async function startPerformanceReview(uid: number, input: { deploymentId: number; period: string }): Promise<number> {
  const dep = (await deploymentsIn(input.period, eq(deployments.id, input.deploymentId)))[0];
  if (!dep) {
    const exists = await db.select({ id: deployments.id }).from(deployments).where(eq(deployments.id, input.deploymentId)).get();
    if (!exists) throw notFound('Deployment');
    throw new ReviewError('This deployment was not active in that month.');
  }
  // Insert-or-ignore on the (deployment, period) index: two people pressing
  // Start at once get the same review, not a constraint error.
  await db
    .insert(performanceReviews)
    .values({
      deploymentId: dep.id,
      resourceId: dep.resourceId,
      clientId: dep.clientId,
      period: input.period,
      createdByUserId: uid || null,
    })
    .onConflictDoNothing()
    .run();
  const row = await db
    .select({ id: performanceReviews.id })
    .from(performanceReviews)
    .where(and(eq(performanceReviews.deploymentId, dep.id), eq(performanceReviews.period, input.period)))
    .get();
  if (!row) throw new ReviewError('The review could not be opened. Try again.', 500);
  return row.id;
}

export type CriterionRow = { id: number; label: string; description: string | null; active: boolean; sortOrder: number };

export async function listCriteria(): Promise<CriterionRow[]> {
  return db
    .select({
      id: reviewCriteria.id,
      label: reviewCriteria.label,
      description: reviewCriteria.description,
      active: reviewCriteria.active,
      sortOrder: reviewCriteria.sortOrder,
    })
    .from(reviewCriteria)
    .orderBy(asc(reviewCriteria.sortOrder), asc(reviewCriteria.id))
    .all();
}

export type HistoryRow = {
  reviewId: number;
  period: string;
  clientName: string;
  status: ReviewStatus;
  average: number | null;
  scores: Record<number, number>;
};

export type PerformanceReviewDetail = {
  id: number;
  period: string;
  status: ReviewStatus;
  deploymentId: number;
  resourceId: number;
  resourceName: string;
  designation: string | null;
  projectName: string;
  clientName: string;
  startDate: string;
  endDate: string | null;
  summary: string | null;
  strengths: string | null;
  improvements: string | null;
  clientFeedback: string | null;
  clientFeedbackBy: string | null;
  clientFeedbackDate: string | null;
  returnedReason: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  /** Active criteria, plus any retired one this review was scored on. */
  criteria: CriterionRow[];
  scores: { criterionId: number; score: number; note: string | null }[];
  average: number | null;
  timesheet: PeriodSummary;
  /** This resource's last six months of reviews, newest first, across clients. */
  history: HistoryRow[];
};

/** Approved timesheet figures for one deployment inside one month (M65). */
async function monthTimesheet(
  d: { id: number; clientId: number; startDate: string; endDate: string | null; fullDayHours: number },
  period: string,
): Promise<PeriodSummary> {
  const { from, to } = periodBounds(period);
  const winFrom = d.startDate > from ? d.startDate : from;
  const winTo = d.endDate && d.endDate < to ? d.endDate : to;
  if (winTo < winFrom) {
    return { expectedDays: 0, approvedDays: 0, workedDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, complete: false };
  }
  const entries = await db
    .select({
      entryDate: timesheetEntries.entryDate,
      entryType: timesheetEntries.entryType,
      hours: timesheetEntries.hours,
      status: timesheetEntries.status,
    })
    .from(timesheetEntries)
    .where(and(eq(timesheetEntries.deploymentId, d.id), gte(timesheetEntries.entryDate, winFrom), lte(timesheetEntries.entryDate, winTo)))
    .all();
  const hol = new Set((await holidaysBetween(db, winFrom, winTo, [d.clientId])).map((h) => h.date));
  return periodSummary([{ from: winFrom, to: winTo, fullDayHours: d.fullDayHours, entries }], hol);
}

async function resourceHistory(resourceId: number, upTo: string): Promise<HistoryRow[]> {
  const rows = await db
    .select({
      reviewId: performanceReviews.id,
      period: performanceReviews.period,
      clientName: clients.companyName,
      status: performanceReviews.status,
    })
    .from(performanceReviews)
    .innerJoin(clients, eq(performanceReviews.clientId, clients.id))
    .where(
      and(
        eq(performanceReviews.resourceId, resourceId),
        lte(performanceReviews.period, upTo),
        gte(performanceReviews.period, shiftPeriod(upTo, -5)),
      ),
    )
    .orderBy(desc(performanceReviews.period), asc(clients.companyName))
    .all();
  if (rows.length === 0) return [];
  const scoreRows = await db
    .select({
      reviewId: performanceReviewScores.reviewId,
      criterionId: performanceReviewScores.criterionId,
      score: performanceReviewScores.score,
    })
    .from(performanceReviewScores)
    .where(inArray(performanceReviewScores.reviewId, rows.map((r) => r.reviewId)))
    .all();
  return rows.map((r) => {
    const mine = scoreRows.filter((s) => s.reviewId === r.reviewId);
    return {
      ...r,
      average: averageScore(mine.map((s) => s.score)),
      scores: Object.fromEntries(mine.map((s) => [s.criterionId, s.score])),
    };
  });
}

export async function getPerformanceReview(v: Pick<Viewer, 'role'>, id: number): Promise<PerformanceReviewDetail> {
  // Sales never reaches this (middleware), but the rule is stated here too.
  if (!seesAllReviews(v)) throw notFound('Review');
  const submitter = alias(users, 'submitter');
  const approver = alias(users, 'approver');
  const r = await db
    .select({
      id: performanceReviews.id,
      period: performanceReviews.period,
      status: performanceReviews.status,
      deploymentId: performanceReviews.deploymentId,
      resourceId: performanceReviews.resourceId,
      resourceName: resources.name,
      designation: resources.designation,
      projectName: projects.projectName,
      clientId: performanceReviews.clientId,
      clientName: clients.companyName,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      fullDayHours: deployments.fullDayHours,
      summary: performanceReviews.summary,
      strengths: performanceReviews.strengths,
      improvements: performanceReviews.improvements,
      clientFeedback: performanceReviews.clientFeedback,
      clientFeedbackBy: performanceReviews.clientFeedbackBy,
      clientFeedbackDate: performanceReviews.clientFeedbackDate,
      returnedReason: performanceReviews.returnedReason,
      submittedAt: performanceReviews.submittedAt,
      submittedByName: submitter.name,
      approvedAt: performanceReviews.approvedAt,
      approvedByName: approver.name,
    })
    .from(performanceReviews)
    .innerJoin(deployments, eq(performanceReviews.deploymentId, deployments.id))
    .innerJoin(resources, eq(performanceReviews.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(performanceReviews.clientId, clients.id))
    .leftJoin(submitter, eq(performanceReviews.submittedByUserId, submitter.id))
    .leftJoin(approver, eq(performanceReviews.approvedByUserId, approver.id))
    .where(eq(performanceReviews.id, id))
    .get();
  if (!r) throw notFound('Review');

  const scores = await db
    .select({
      criterionId: performanceReviewScores.criterionId,
      score: performanceReviewScores.score,
      note: performanceReviewScores.note,
    })
    .from(performanceReviewScores)
    .where(eq(performanceReviewScores.reviewId, id))
    .all();
  const scored = new Set(scores.map((s) => s.criterionId));
  const criteria = (await listCriteria()).filter((c) => c.active || scored.has(c.id));

  const { fullDayHours, clientId, ...rest } = r;
  return {
    ...rest,
    criteria,
    scores,
    average: averageScore(scores.map((s) => s.score)),
    timesheet: await monthTimesheet(
      { id: r.deploymentId, clientId, startDate: r.startDate, endDate: r.endDate, fullDayHours },
      r.period,
    ),
    history: await resourceHistory(r.resourceId, r.period),
  };
}

async function loadPerformanceStatus(id: number): Promise<ReviewStatus> {
  const row = await db.select({ status: performanceReviews.status }).from(performanceReviews).where(eq(performanceReviews.id, id)).get();
  if (!row) throw notFound('Review');
  return row.status;
}

/** Saves a draft: its text and every score. Scores not sent are removed. */
export async function savePerformanceReview(id: number, data: z.output<typeof performanceReviewSchema>): Promise<void> {
  const status = await loadPerformanceStatus(id);
  if (!isReviewEditable(status)) {
    throw new ReviewError('This review has been submitted and can no longer be edited.', 409);
  }

  const known = new Set((await listCriteria()).map((c) => c.id));
  const unknown = data.scores.find((s) => !known.has(s.criterionId));
  if (unknown) throw new ReviewError('One of the criteria no longer exists. Reload the page.');
  const seen = new Set<number>();
  for (const s of data.scores) {
    if (seen.has(s.criterionId)) throw new ReviewError('A criterion was scored twice.');
    seen.add(s.criterionId);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(performanceReviews)
      .set({
        summary: data.summary,
        strengths: data.strengths,
        improvements: data.improvements,
        clientFeedback: data.clientFeedback,
        clientFeedbackBy: data.clientFeedbackBy,
        clientFeedbackDate: data.clientFeedbackDate,
        updatedAt: now(),
      })
      .where(eq(performanceReviews.id, id))
      .run();
    await tx.delete(performanceReviewScores).where(eq(performanceReviewScores.reviewId, id)).run();
    for (const s of data.scores) {
      if (s.score === null) continue;
      await tx
        .insert(performanceReviewScores)
        .values({ reviewId: id, criterionId: s.criterionId, score: s.score, note: s.note })
        .run();
    }
  });
}

/** Submit (Resource Manager), approve or return (Admin — enforced in lib/access.ts). */
export async function actOnPerformanceReview(
  uid: number,
  id: number,
  action: ReviewAction,
  reason?: string,
): Promise<ReviewStatus> {
  const status = await loadPerformanceStatus(id);
  const move = reviewTransition(status, action);
  if (move.error !== undefined) throw new ReviewError(move.error, 409);

  if (action === 'submit') {
    const active = (await listCriteria()).filter((c) => c.active).map((c) => c.id);
    const scores = await db
      .select({ criterionId: performanceReviewScores.criterionId, score: performanceReviewScores.score })
      .from(performanceReviewScores)
      .where(eq(performanceReviewScores.reviewId, id))
      .all();
    const err = submitError(active, scores);
    if (err) throw new ReviewError(err);
  }

  const res = await db
    .update(performanceReviews)
    .set(transitionFields(action, uid, reason))
    // Guarded on the status read above, so two people acting at once cannot
    // both succeed: the second update matches no row and is told so.
    .where(and(eq(performanceReviews.id, id), eq(performanceReviews.status, status)))
    .run();
  if (res.rowsAffected === 0) throw new ReviewError('Someone else changed this review. Reload the page.', 409);
  return move.to;
}

function transitionFields(action: ReviewAction, uid: number, reason?: string) {
  const at = now();
  if (action === 'submit') {
    return { status: 'submitted' as const, submittedAt: at, submittedByUserId: uid || null, returnedReason: null, updatedAt: at };
  }
  if (action === 'approve') {
    return { status: 'approved' as const, approvedAt: at, approvedByUserId: uid || null, updatedAt: at };
  }
  return { status: 'draft' as const, returnedReason: reason?.trim() || 'Returned for changes', updatedAt: at };
}

/* ── Account reviews ───────────────────────────────────────── */

/**
 * Q5: the clients a salesperson owns a requirement at. A Sales head sees
 * every client any salesperson owns one at.
 */
async function salesClientIds(v: Pick<Viewer, 'uid' | 'isTeamLead'>): Promise<number[]> {
  const rows = await db
    .selectDistinct({ clientId: opportunities.clientId })
    .from(opportunities)
    .where(
      and(
        isNotNull(opportunities.clientId),
        v.isTeamLead ? isNotNull(opportunities.salesOwnerUserId) : eq(opportunities.salesOwnerUserId, v.uid || -1),
      ),
    )
    .all();
  return rows.map((r) => r.clientId).filter((id): id is number => id !== null);
}

export async function startAccountReview(uid: number, input: { clientId: number; period: string }): Promise<number> {
  const client = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId)).get();
  if (!client) throw notFound('Client');
  await db
    .insert(accountReviews)
    .values({ clientId: client.id, period: input.period, createdByUserId: uid || null })
    .onConflictDoNothing()
    .run();
  const row = await db
    .select({ id: accountReviews.id })
    .from(accountReviews)
    .where(and(eq(accountReviews.clientId, client.id), eq(accountReviews.period, input.period)))
    .get();
  if (!row) throw new ReviewError('The review could not be opened. Try again.', 500);
  return row.id;
}

export type AccountReviewListRow = {
  id: number;
  clientName: string;
  period: string;
  status: ReviewStatus;
  rating: AccountRating | null;
  approvedAt: string | null;
};

/** Account reviews across months: everything for the back office, approved ones of its clients for Sales. */
export async function listAccountReviews(v: Pick<Viewer, 'role' | 'uid' | 'isTeamLead'>): Promise<AccountReviewListRow[]> {
  let scope;
  if (!seesAllReviews(v)) {
    if (v.role !== 'sales') return [];
    const ids = await salesClientIds(v);
    if (ids.length === 0) return [];
    scope = and(eq(accountReviews.status, 'approved'), inArray(accountReviews.clientId, ids));
  }
  return db
    .select({
      id: accountReviews.id,
      clientName: clients.companyName,
      period: accountReviews.period,
      status: accountReviews.status,
      rating: accountReviews.rating,
      approvedAt: accountReviews.approvedAt,
    })
    .from(accountReviews)
    .innerJoin(clients, eq(accountReviews.clientId, clients.id))
    .where(scope)
    .orderBy(desc(accountReviews.period), asc(clients.companyName))
    .all();
}

export type AccountReviewResource = {
  resourceName: string;
  projectName: string;
  /** Null for Sales, which does not see performance reviews. */
  reviewId: number | null;
  status: ReviewStatus | null;
  average: number | null;
};

export type AccountReviewDetail = {
  id: number;
  clientId: number;
  clientName: string;
  period: string;
  status: ReviewStatus;
  rating: AccountRating | null;
  summary: string | null;
  risks: string | null;
  opportunities: string | null;
  actions: string | null;
  returnedReason: string | null;
  submittedAt: string | null;
  submittedByName: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  resources: AccountReviewResource[];
  /** The client's last six months of ratings, newest first. */
  history: { period: string; status: ReviewStatus; rating: AccountRating | null }[];
};

export async function getAccountReview(v: Pick<Viewer, 'role' | 'uid' | 'isTeamLead'>, id: number): Promise<AccountReviewDetail> {
  const submitter = alias(users, 'submitter');
  const approver = alias(users, 'approver');
  const r = await db
    .select({
      id: accountReviews.id,
      clientId: accountReviews.clientId,
      clientName: clients.companyName,
      period: accountReviews.period,
      status: accountReviews.status,
      rating: accountReviews.rating,
      summary: accountReviews.summary,
      risks: accountReviews.risks,
      opportunities: accountReviews.opportunities,
      actions: accountReviews.actions,
      returnedReason: accountReviews.returnedReason,
      submittedAt: accountReviews.submittedAt,
      submittedByName: submitter.name,
      approvedAt: accountReviews.approvedAt,
      approvedByName: approver.name,
    })
    .from(accountReviews)
    .innerJoin(clients, eq(accountReviews.clientId, clients.id))
    .leftJoin(submitter, eq(accountReviews.submittedByUserId, submitter.id))
    .leftJoin(approver, eq(accountReviews.approvedByUserId, approver.id))
    .where(eq(accountReviews.id, id))
    .get();
  if (!r) throw notFound('Review');

  const full = seesAllReviews(v);
  if (!full) {
    if (v.role !== 'sales' || r.status !== 'approved') throw notFound('Review');
    if (!(await salesClientIds(v)).includes(r.clientId)) throw notFound('Review');
  }

  const deps = await deploymentsIn(r.period, eq(clients.id, r.clientId));
  let perfByDeployment = new Map<number, { id: number; status: ReviewStatus }>();
  let averages = new Map<number, number | null>();
  if (full && deps.length > 0) {
    const perf = await db
      .select({ id: performanceReviews.id, deploymentId: performanceReviews.deploymentId, status: performanceReviews.status })
      .from(performanceReviews)
      .where(and(eq(performanceReviews.period, r.period), inArray(performanceReviews.deploymentId, deps.map((d) => d.id))))
      .all();
    perfByDeployment = new Map(perf.map((p) => [p.deploymentId, { id: p.id, status: p.status }]));
    averages = await averagesFor(perf.map((p) => p.id));
  }

  const historyScope = full ? undefined : eq(accountReviews.status, 'approved');
  const history = await db
    .select({ period: accountReviews.period, status: accountReviews.status, rating: accountReviews.rating })
    .from(accountReviews)
    .where(
      and(
        eq(accountReviews.clientId, r.clientId),
        lte(accountReviews.period, r.period),
        gte(accountReviews.period, shiftPeriod(r.period, -5)),
        historyScope,
      ),
    )
    .orderBy(desc(accountReviews.period))
    .all();

  // Sales gets the approved review and who is deployed — never the reason it
  // was returned, nor anyone's performance (allowlisted, not deleted).
  return {
    id: r.id,
    clientId: r.clientId,
    clientName: r.clientName,
    period: r.period,
    status: r.status,
    rating: r.rating,
    summary: r.summary,
    risks: r.risks,
    opportunities: r.opportunities,
    actions: r.actions,
    returnedReason: full ? r.returnedReason : null,
    submittedAt: r.submittedAt,
    submittedByName: r.submittedByName,
    approvedAt: r.approvedAt,
    approvedByName: r.approvedByName,
    resources: deps.map((d) => {
      const p = full ? perfByDeployment.get(d.id) : undefined;
      return {
        resourceName: d.resourceName,
        projectName: d.projectName,
        reviewId: p?.id ?? null,
        status: p?.status ?? null,
        average: p ? (averages.get(p.id) ?? null) : null,
      };
    }),
    history,
  };
}

async function loadAccountStatus(id: number): Promise<ReviewStatus> {
  const row = await db.select({ status: accountReviews.status }).from(accountReviews).where(eq(accountReviews.id, id)).get();
  if (!row) throw notFound('Review');
  return row.status;
}

export async function saveAccountReview(id: number, data: z.output<typeof accountReviewSchema>): Promise<void> {
  const status = await loadAccountStatus(id);
  if (!isReviewEditable(status)) {
    throw new ReviewError('This review has been submitted and can no longer be edited.', 409);
  }
  await db
    .update(accountReviews)
    .set({
      rating: data.rating,
      summary: data.summary,
      risks: data.risks,
      opportunities: data.opportunities,
      actions: data.actions,
      updatedAt: now(),
    })
    .where(eq(accountReviews.id, id))
    .run();
}

export async function actOnAccountReview(uid: number, id: number, action: ReviewAction, reason?: string): Promise<ReviewStatus> {
  const status = await loadAccountStatus(id);
  const move = reviewTransition(status, action);
  if (move.error !== undefined) throw new ReviewError(move.error, 409);
  if (action === 'submit') {
    const row = await db
      .select({ rating: accountReviews.rating, summary: accountReviews.summary })
      .from(accountReviews)
      .where(eq(accountReviews.id, id))
      .get();
    if (!row?.rating) throw new ReviewError('Give the account a rating before submitting.');
    if (!row.summary) throw new ReviewError('Write a summary before submitting.');
  }
  const res = await db
    .update(accountReviews)
    .set(transitionFields(action, uid, reason))
    .where(and(eq(accountReviews.id, id), eq(accountReviews.status, status)))
    .run();
  if (res.rowsAffected === 0) throw new ReviewError('Someone else changed this review. Reload the page.', 409);
  return move.to;
}

/* ── Criteria (Q7) ─────────────────────────────────────────── */

export async function createCriterion(data: { label: string; description: string | null }): Promise<CriterionRow> {
  const max = await db.select({ n: sql<number>`coalesce(max(${reviewCriteria.sortOrder}), -1)` }).from(reviewCriteria).get();
  const row = await db
    .insert(reviewCriteria)
    .values({ label: data.label, description: data.description, sortOrder: Number(max?.n ?? -1) + 1 })
    .returning()
    .get();
  return { id: row.id, label: row.label, description: row.description, active: row.active, sortOrder: row.sortOrder };
}

export async function updateCriterion(id: number, data: z.output<typeof reviewCriterionUpdateSchema>): Promise<void> {
  const existing = await db.select({ id: reviewCriteria.id }).from(reviewCriteria).where(eq(reviewCriteria.id, id)).get();
  if (!existing) throw notFound('Criterion');
  if (data.active === false) {
    const others = await db
      .select({ id: reviewCriteria.id })
      .from(reviewCriteria)
      .where(eq(reviewCriteria.active, true))
      .all();
    if (others.filter((c) => c.id !== id).length === 0) {
      throw new ReviewError('Keep at least one criterion active — a review needs something to score.');
    }
  }
  const set: Partial<typeof reviewCriteria.$inferInsert> = {};
  if (data.label !== undefined) set.label = data.label;
  if (data.description !== undefined) set.description = data.description;
  if (data.active !== undefined) set.active = data.active;
  if (data.sortOrder !== undefined) set.sortOrder = data.sortOrder;
  if (Object.keys(set).length === 0) return;
  await db.update(reviewCriteria).set(set).where(eq(reviewCriteria.id, id)).run();
}

/* ── Skill matrix (G-RM-02) ────────────────────────────────── */

export type SkillRow = { id: number; name: string; active: boolean; resources: number };

export type MatrixResource = {
  id: number;
  name: string;
  designation: string | null;
  /** The free-text skills the resource record carries, for reference. */
  primarySkill: string | null;
  levels: { skillId: number; level: number; assessedAt: string | null }[];
};

export type SkillMatrix = { skills: SkillRow[]; resources: MatrixResource[] };

export async function skillMatrix(): Promise<SkillMatrix> {
  const skillRows = await db
    .select({ id: skills.id, name: skills.name, active: skills.active })
    .from(skills)
    .orderBy(asc(sql`lower(${skills.name})`))
    .all();
  const people = await db
    .select({ id: resources.id, name: resources.name, designation: resources.designation, primarySkill: resources.primarySkill })
    .from(resources)
    .orderBy(asc(resources.name))
    .all();
  const levels = await db
    .select({
      resourceId: resourceSkills.resourceId,
      skillId: resourceSkills.skillId,
      level: resourceSkills.level,
      assessedAt: resourceSkills.assessedAt,
    })
    .from(resourceSkills)
    .all();

  const counts = new Map<number, number>();
  const byResource = new Map<number, MatrixResource['levels']>();
  for (const l of levels) {
    counts.set(l.skillId, (counts.get(l.skillId) ?? 0) + 1);
    const list = byResource.get(l.resourceId) ?? [];
    list.push({ skillId: l.skillId, level: l.level, assessedAt: l.assessedAt });
    byResource.set(l.resourceId, list);
  }
  return {
    skills: skillRows.map((s) => ({ ...s, resources: counts.get(s.id) ?? 0 })),
    resources: people.map((p) => ({ ...p, levels: byResource.get(p.id) ?? [] })),
  };
}

async function skillNameTaken(name: string, exceptId?: number): Promise<boolean> {
  const hit = await db
    .select({ id: skills.id })
    .from(skills)
    .where(eq(sql`lower(${skills.name})`, skillKey(name)))
    .get();
  return Boolean(hit && hit.id !== exceptId);
}

export async function createSkill(uid: number, rawName: string): Promise<SkillRow> {
  const name = normaliseSkillName(rawName);
  if (!name) throw new ReviewError('Name the skill');
  if (await skillNameTaken(name)) throw new ReviewError(`"${name}" is already in the list.`, 409);
  const row = await db.insert(skills).values({ name, createdByUserId: uid || null }).returning().get();
  return { id: row.id, name: row.name, active: row.active, resources: 0 };
}

export async function updateSkill(id: number, data: z.output<typeof skillUpdateSchema>): Promise<void> {
  const existing = await db.select({ id: skills.id }).from(skills).where(eq(skills.id, id)).get();
  if (!existing) throw notFound('Skill');
  const set: Partial<typeof skills.$inferInsert> = {};
  if (data.name !== undefined) {
    const name = normaliseSkillName(data.name);
    if (!name) throw new ReviewError('Name the skill');
    if (await skillNameTaken(name, id)) throw new ReviewError(`"${name}" is already in the list.`, 409);
    set.name = name;
  }
  if (data.active !== undefined) set.active = data.active;
  if (Object.keys(set).length === 0) return;
  await db.update(skills).set(set).where(eq(skills.id, id)).run();
}

/**
 * Replaces a resource's levels with the ones sent. A level on a retired
 * skill may be kept as it was but not newly set or changed.
 */
export async function setResourceSkills(
  uid: number,
  resourceId: number,
  data: z.output<typeof resourceSkillsSchema>,
): Promise<void> {
  const person = await db.select({ id: resources.id }).from(resources).where(eq(resources.id, resourceId)).get();
  if (!person) throw notFound('Resource');

  const wanted = new Map<number, number>();
  for (const l of data.levels) {
    if (wanted.has(l.skillId)) throw new ReviewError('A skill was listed twice.');
    if (l.level !== null) wanted.set(l.skillId, l.level);
  }

  const catalogue = new Map(
    (await db.select({ id: skills.id, active: skills.active }).from(skills).all()).map((s) => [s.id, s.active]),
  );
  const current = new Map(
    (
      await db
        .select({ skillId: resourceSkills.skillId, level: resourceSkills.level })
        .from(resourceSkills)
        .where(eq(resourceSkills.resourceId, resourceId))
        .all()
    ).map((r) => [r.skillId, r.level]),
  );
  for (const [skillId, level] of wanted) {
    const active = catalogue.get(skillId);
    if (active === undefined) throw new ReviewError('One of the skills no longer exists. Reload the page.');
    if (!active && current.get(skillId) !== level) throw new ReviewError('A retired skill cannot be given a new level.');
  }

  const at = now();
  await db.transaction(async (tx) => {
    for (const [skillId, oldLevel] of current) {
      if (!wanted.has(skillId)) {
        await tx
          .delete(resourceSkills)
          .where(and(eq(resourceSkills.resourceId, resourceId), eq(resourceSkills.skillId, skillId)))
          .run();
      } else if (wanted.get(skillId) !== oldLevel) {
        await tx
          .update(resourceSkills)
          .set({ level: wanted.get(skillId)!, assessedByUserId: uid || null, assessedAt: at })
          .where(and(eq(resourceSkills.resourceId, resourceId), eq(resourceSkills.skillId, skillId)))
          .run();
      }
    }
    for (const [skillId, level] of wanted) {
      if (current.has(skillId)) continue;
      await tx
        .insert(resourceSkills)
        .values({ resourceId, skillId, level, assessedByUserId: uid || null, assessedAt: at })
        .run();
    }
  });
}
