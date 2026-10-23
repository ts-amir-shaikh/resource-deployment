import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, min, or, sql } from 'drizzle-orm';
import { db } from './db';
import {
  clients,
  deployments,
  holidays,
  invoiceResources,
  invoices,
  projects,
  resources,
  timesheetEntries,
  users,
} from './schema';
import {
  addBuckets,
  deploymentStats,
  emptyBuckets,
  resourceStats,
  round1,
  utilisation,
  type DashDeployment,
  type DashEntry,
  type DeploymentStats,
  type HourBuckets,
  type ResourceStats,
} from './timesheet-dashboard-rules';
import { dayReason, dayStatus, dayTone, expectedHours, type DayTone } from './timesheet-week';
import {
  STANDARD_DAY_HOURS,
  TASK_KIND_LABELS,
  datesBetween,
  isIsoDate,
  type EntryStatus,
  type EntryType,
  type PeriodSummary,
  type TaskKind,
} from './timesheet-rules';
import { lineSummary } from './timesheets';
import { leaveDaysInRange } from './leaves';

/**
 * Server side of the timesheet dashboard (FSD-18 v1.1). Admin only (D20) — the
 * door is `lib/access.ts`, and nothing here takes a viewer because there is
 * only one kind that gets in.
 *
 * Hours come from lib/timesheet-dashboard-rules.ts. Money appears in exactly
 * one place, the Invoices tab, and is read from the stored invoice line as it
 * was raised: never recomputed (D21) and never added across currencies. No
 * salary, CTC, margin or commission column is selected anywhere in this file.
 */

/** A year, so one request cannot sweep the whole entries table. */
const MAX_RANGE_DAYS = 366;

export type DashFilters = {
  from: string;
  to: string;
  resourceId?: number;
  clientId?: number;
  projectId?: number;
  deploymentId?: number;
};

/** Validates the query string. Returns a message when it cannot be used. */
export function parseDashFilters(p: URLSearchParams, today: string): DashFilters | string {
  const month = today.slice(0, 7);
  const from = p.get('from') || `${month}-01`;
  const to = p.get('to') || endOfMonth(from);
  if (!isIsoDate(from) || !isIsoDate(to)) return 'Use valid dates for the period.';
  if (to < from) return 'The period ends before it starts.';
  if (datesBetween(from, to).length > MAX_RANGE_DAYS) return 'Choose a period of a year or less.';
  const id = (k: string) => {
    const n = Number(p.get(k));
    return Number.isInteger(n) && n > 0 ? n : undefined;
  };
  return {
    from,
    to,
    resourceId: id('resource'),
    clientId: id('client'),
    projectId: id('project'),
    deploymentId: id('deployment'),
  };
}

function endOfMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/* ── Loading the window ────────────────────────────────────── */

type DeploymentRow = DashDeployment & {
  resourceName: string;
  clientId: number;
  clientName: string;
  projectId: number;
  projectName: string;
  allocationPercentage: number;
  timesheetVersion: string | null;
  status: string;
};

async function loadWindow(f: DashFilters) {
  const conds = [
    lte(deployments.startDate, f.to),
    or(isNull(deployments.endDate), gte(deployments.endDate, f.from)),
  ];
  if (f.resourceId) conds.push(eq(deployments.resourceId, f.resourceId));
  if (f.clientId) conds.push(eq(projects.clientId, f.clientId));
  if (f.projectId) conds.push(eq(deployments.projectId, f.projectId));
  if (f.deploymentId) conds.push(eq(deployments.id, f.deploymentId));

  const rows = await db
    .select({
      id: deployments.id,
      resourceId: deployments.resourceId,
      resourceName: resources.name,
      projectId: projects.id,
      projectName: projects.projectName,
      clientId: clients.id,
      clientName: clients.companyName,
      deploymentType: deployments.deploymentType,
      fullDayHours: deployments.fullDayHours,
      allocationPercentage: deployments.allocationPercentage,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      timesheetVersion: deployments.timesheetVersion,
      projectVersion: projects.timesheetVersion,
      status: deployments.status,
    })
    .from(deployments)
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(and(...conds))
    .orderBy(asc(resources.name), asc(deployments.startDate))
    .all();

  const hol = await db
    .select({ date: holidays.holidayDate, clientId: holidays.clientId })
    .from(holidays)
    .where(and(gte(holidays.holidayDate, f.from), lte(holidays.holidayDate, f.to)))
    .all();

  const deps: DeploymentRow[] = rows.map((r) => ({
    id: r.id,
    resourceId: r.resourceId,
    resourceName: r.resourceName,
    clientId: r.clientId,
    clientName: r.clientName,
    projectId: r.projectId,
    projectName: r.projectName,
    billable: r.deploymentType === 'billable',
    fullDayHours: r.fullDayHours,
    allocationPercentage: r.allocationPercentage,
    startDate: r.startDate,
    endDate: r.endDate,
    timesheetVersion: r.timesheetVersion ?? r.projectVersion,
    status: r.status,
    // Company-wide holidays plus those of this deployment's client.
    holidays: new Set(hol.filter((h) => h.clientId == null || h.clientId === r.clientId).map((h) => h.date)),
  }));

  const ids = deps.map((d) => d.id);
  const entries: DashEntry[] = ids.length
    ? await db
        .select({
          deploymentId: timesheetEntries.deploymentId,
          entryDate: timesheetEntries.entryDate,
          entryType: timesheetEntries.entryType,
          hours: timesheetEntries.hours,
          taskKind: timesheetEntries.taskKind,
          status: timesheetEntries.status,
        })
        .from(timesheetEntries)
        .where(
          and(
            inArray(timesheetEntries.deploymentId, ids),
            gte(timesheetEntries.entryDate, f.from),
            lte(timesheetEntries.entryDate, f.to),
          ),
        )
        .all()
    : [];

  // FSD-21: leave is recorded by approved requests, not timesheet rows. Each
  // leave day is counted once, on the resource's first deployment that covers
  // it, at the standard day (capacity is measured at the standard day).
  const byResource = new Map<number, DeploymentRow[]>();
  for (const d of deps) byResource.set(d.resourceId, [...(byResource.get(d.resourceId) ?? []), d]);
  for (const [resourceId, list] of byResource) {
    const hol = new Set(list.flatMap((d) => [...d.holidays]));
    for (const l of await leaveDaysInRange(db, resourceId, f.from, f.to, hol, ['approved'])) {
      const on = list.find((d) => d.startDate <= l.date && (!d.endDate || d.endDate >= l.date));
      if (!on) continue;
      entries.push({
        deploymentId: on.id,
        entryDate: l.date,
        entryType: l.type === 'paid' ? 'paid_leave' : 'unpaid_leave',
        hours: l.fraction * STANDARD_DAY_HOURS,
        taskKind: null,
        status: 'approved',
      });
    }
  }

  return { deps, entries };
}

/* ── Backlog: current, not tied to the period ──────────────── */

export type Backlog = {
  submittedDays: number;
  /** ISO timestamp of the oldest submitted row, or null when nothing waits. */
  oldestSubmittedAt: string | null;
  rejectedDays: number;
};

async function loadBacklog(deploymentIds: number[]): Promise<Backlog> {
  if (!deploymentIds.length) return { submittedDays: 0, oldestSubmittedAt: null, rejectedDays: 0 };
  const days = (status: EntryStatus) =>
    db
      .select({ n: sql<number>`count(distinct ${timesheetEntries.deploymentId} || ':' || ${timesheetEntries.entryDate})` })
      .from(timesheetEntries)
      .where(and(inArray(timesheetEntries.deploymentId, deploymentIds), eq(timesheetEntries.status, status)))
      .get();
  const [sub, rej, oldest] = await Promise.all([
    days('submitted'),
    days('rejected'),
    db
      .select({ at: min(timesheetEntries.submittedAt) })
      .from(timesheetEntries)
      .where(and(inArray(timesheetEntries.deploymentId, deploymentIds), eq(timesheetEntries.status, 'submitted')))
      .get(),
  ]);
  return {
    submittedDays: Number(sub?.n ?? 0),
    rejectedDays: Number(rej?.n ?? 0),
    oldestSubmittedAt: oldest?.at ?? null,
  };
}

/* ── The dashboard ─────────────────────────────────────────── */

export type ResourceRow = ResourceStats & { resourceId: number; resourceName: string; deploymentCount: number };

export type DeploymentRowOut = DeploymentStats & {
  id: number;
  resourceName: string;
  clientName: string;
  projectName: string;
  billable: boolean;
  allocationPercentage: number;
  fullDayHours: number;
  version: string | null;
  status: string;
};

export type InvoiceLineRow = {
  invoiceId: number;
  invoiceNumber: string | null;
  invoiceStatus: string;
  currency: string;
  periodFrom: string;
  periodTo: string;
  resourceId: number;
  resourceName: string;
  clientName: string;
  projectName: string;
  /** The line as stored when it was raised. Never recomputed. */
  monthlyRate: number;
  workingDays: number | null;
  billedDays: number | null;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  amount: number;
  leaveFromTimesheet: boolean;
  /** Raised before lines carried a rate and amount: nothing to show, so "—" rather than 0. */
  legacy: boolean;
  /** What the timesheets say now, for comparison. */
  coverage: Pick<PeriodSummary, 'approvedDays' | 'expectedDays' | 'complete'>;
  flags: ('raised_before_approved' | 'leave_typed_but_approved')[];
};

export type UninvoicedRow = {
  deploymentId: number;
  resourceName: string;
  clientName: string;
  projectName: string;
  approvedDays: number;
};

export type DashboardData = {
  period: { from: string; to: string };
  overview: HourBuckets & {
    capacityHours: number;
    taskedWorkHours: number;
    remainingHours: number;
    billableUtilisation: number | null;
    taskBackedUtilisation: number | null;
    totalUtilisation: number | null;
    resourceCount: number;
    overAllocatedCount: number;
    /** Resources with the most remaining hours, for the Overview tab. */
    mostRemaining: { resourceId: number; resourceName: string; remainingHours: number }[];
  };
  backlog: Backlog;
  resources: ResourceRow[];
  deployments: DeploymentRowOut[];
};

/**
 * The Invoices tab, loaded on its own: each line is checked against the
 * timesheets one by one, which is too slow to do for every tab on every page
 * load.
 */
export type InvoicesTabData = {
  lines: InvoiceLineRow[];
  /** Billed amounts by currency — summed within a currency, never across. */
  billedByCurrency: { currency: string; amount: number }[];
  uninvoiced: UninvoicedRow[];
};

const MAX_INVOICE_LINES = 200;

export async function loadDashboard(f: DashFilters): Promise<DashboardData> {
  const { deps, entries } = await loadWindow(f);

  // Resources: one row each, over their deployments inside the filters.
  const byResource = new Map<number, DeploymentRow[]>();
  for (const d of deps) byResource.set(d.resourceId, [...(byResource.get(d.resourceId) ?? []), d]);

  const resourceRows: ResourceRow[] = [...byResource.entries()].map(([resourceId, list]) => ({
    ...resourceStats(list, entries, f.from, f.to),
    resourceId,
    resourceName: list[0].resourceName,
    deploymentCount: list.length,
  }));

  const deploymentRows: DeploymentRowOut[] = deps.map((d) => ({
    ...deploymentStats(d, entries, f.from, f.to),
    id: d.id,
    resourceName: d.resourceName,
    clientName: d.clientName,
    projectName: d.projectName,
    billable: d.billable,
    allocationPercentage: d.allocationPercentage,
    fullDayHours: d.fullDayHours,
    version: d.timesheetVersion,
    status: d.status,
  }));

  // Company-wide totals are the sum of the people, so the headline and the
  // table can never disagree.
  const totals = resourceRows.reduce<HourBuckets>((acc, r) => addBuckets(acc, r), emptyBuckets());
  const capacityHours = resourceRows.reduce((s, r) => s + r.capacityHours, 0);
  const tasked = totals.clientWorkHours - totals.noClientTaskHours;
  const remaining = resourceRows.reduce((s, r) => s + r.remainingHours, 0);

  return {
    period: { from: f.from, to: f.to },
    overview: {
      ...totals,
      capacityHours,
      taskedWorkHours: round1(tasked),
      remainingHours: round1(remaining),
      billableUtilisation: utilisation(totals.clientWorkHours, capacityHours),
      taskBackedUtilisation: utilisation(tasked, capacityHours),
      totalUtilisation: utilisation(totals.clientWorkHours + totals.shadowHours, capacityHours),
      resourceCount: resourceRows.length,
      overAllocatedCount: resourceRows.filter((r) => r.overAllocated).length,
      mostRemaining: [...resourceRows]
        .filter((r) => r.remainingHours > 0)
        .sort((a, b) => b.remainingHours - a.remainingHours)
        .slice(0, 5)
        .map((r) => ({ resourceId: r.resourceId, resourceName: r.resourceName, remainingHours: r.remainingHours })),
    },
    backlog: await loadBacklog(deps.map((d) => d.id)),
    resources: resourceRows,
    deployments: deploymentRows,
  };
}

export async function loadInvoicesTab(f: DashFilters): Promise<InvoicesTabData> {
  const { deps, entries } = await loadWindow(f);
  const depRows = deps.map((d) => ({ ...deploymentStats(d, entries, f.from, f.to), id: d.id, resourceName: d.resourceName, clientName: d.clientName, projectName: d.projectName, billable: d.billable }));
  return loadInvoices(f, deps, depRows);
}

/* ── Invoices tab ──────────────────────────────────────────── */

async function loadInvoices(
  f: DashFilters,
  deps: DeploymentRow[],
  depRows: (DeploymentStats & { id: number; resourceName: string; clientName: string; projectName: string; billable: boolean })[],
): Promise<InvoicesTabData> {
  const resourceIds = [...new Set(deps.map((d) => d.resourceId))];
  const projectIds = [...new Set(deps.map((d) => d.projectId))];
  if (!resourceIds.length) return { lines: [], billedByCurrency: [], uninvoiced: [] };

  const rows = await db
    .select({
      invoiceId: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      invoiceStatus: invoices.status,
      currency: invoices.currency,
      periodFrom: invoices.periodFrom,
      periodTo: invoices.periodTo,
      projectId: invoices.projectId,
      projectName: projects.projectName,
      clientName: clients.companyName,
      resourceId: invoiceResources.resourceId,
      resourceName: resources.name,
      monthlyRate: invoiceResources.monthlyRate,
      workingDays: invoiceResources.workingDays,
      billedDays: invoiceResources.billedDays,
      paidLeaveDays: invoiceResources.paidLeaveDays,
      unpaidLeaveDays: invoiceResources.unpaidLeaveDays,
      amount: invoiceResources.amount,
      leaveFromTimesheet: invoiceResources.leaveFromTimesheet,
    })
    .from(invoiceResources)
    .innerJoin(invoices, eq(invoiceResources.invoiceId, invoices.id))
    .innerJoin(projects, eq(invoices.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .innerJoin(resources, eq(invoiceResources.resourceId, resources.id))
    .where(
      and(
        lte(invoices.periodFrom, f.to),
        gte(invoices.periodTo, f.from),
        inArray(invoiceResources.resourceId, resourceIds),
        inArray(invoices.projectId, projectIds),
      ),
    )
    .orderBy(desc(invoices.periodFrom), asc(resources.name))
    .limit(MAX_INVOICE_LINES)
    .all();

  const lines: InvoiceLineRow[] = [];
  for (const r of rows) {
    // The same read the invoice save uses, so the two cannot disagree.
    const s = await lineSummary(db, { resourceId: r.resourceId, projectId: r.projectId, from: r.periodFrom, to: r.periodTo });
    const raised = r.invoiceStatus !== 'not_raised';
    const flags: InvoiceLineRow['flags'] = [];
    // Only when some days are approved: a line with none has no timesheets
    // behind it at all, which is not the same as a partly approved period.
    if (raised && s.approvedDays > 0 && !s.complete) flags.push('raised_before_approved');
    if (s.complete && !r.leaveFromTimesheet) flags.push('leave_typed_but_approved');
    const { projectId: _p, ...rest } = r;
    lines.push({
      ...rest,
      legacy: r.monthlyRate === 0 && r.amount === 0,
      coverage: { approvedDays: s.approvedDays, expectedDays: s.expectedDays, complete: s.complete },
      flags,
    });
  }

  // Money by currency: each currency is summed on its own, never converted.
  const sums = new Map<string, number>();
  for (const l of lines) if (!l.legacy) sums.set(l.currency, (sums.get(l.currency) ?? 0) + l.amount);

  // Approved billable days in the period with no invoice line for that
  // resource on that project.
  const invoiced = new Set(rows.map((r) => `${r.resourceId}:${r.projectId}`));
  const uninvoiced: UninvoicedRow[] = depRows
    .filter((d) => d.billable && d.coverage.approvedDays > 0)
    .map((d) => ({ d, dep: deps.find((x) => x.id === d.id)! }))
    .filter(({ dep }) => !invoiced.has(`${dep.resourceId}:${dep.projectId}`))
    .map(({ d }) => ({
      deploymentId: d.id,
      resourceName: d.resourceName,
      clientName: d.clientName,
      projectName: d.projectName,
      approvedDays: d.coverage.approvedDays,
    }));

  return {
    lines,
    billedByCurrency: [...sums.entries()].map(([currency, amount]) => ({ currency, amount })),
    uninvoiced,
  };
}

/* ── Activity log: one row per resource per day ───────────── */

export type ActivityEntry = {
  id: number;
  entryType: EntryType;
  hours: number;
  task: string | null;
  taskKind: TaskKind | null;
  status: EntryStatus;
};

export type ActivityDay = {
  key: string;
  date: string;
  resourceId: number;
  resourceName: string;
  clientName: string;
  projectName: string;
  billable: boolean;
  /** Work hours that day. */
  total: number;
  /** What a full day was worth that day, less any leave. */
  expected: number;
  tone: DayTone;
  /** "4.75 h short", "Full day" — why the day is coloured. */
  reason: string;
  holidayName: string | null;
  /** The work rows, as "Project work 7", for the one-line summary. */
  tasks: { label: string; hours: number; fixed: boolean }[];
  /** Leave entered before leave had its own screen, or approved as a leave request. */
  leave: { hours: number; fromRequest: boolean } | null;
  status: EntryStatus | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  entries: ActivityEntry[];
};

export const ACTIVITY_PAGE = 60;

/**
 * Every entry in the period, folded into one row per resource per project per
 * day, so a day reads as a whole: what was worked on, whether it was a full
 * day, and whether it is approved. The entries stay on the row for anyone who
 * wants the detail. Sorted by resource, then newest day first.
 */
export async function loadActivityDays(
  f: DashFilters & { status?: EntryStatus; page: number },
): Promise<{ days: ActivityDay[]; total: number; page: number; pageSize: number }> {
  const conds = [gte(timesheetEntries.entryDate, f.from), lte(timesheetEntries.entryDate, f.to)];
  if (f.resourceId) conds.push(eq(deployments.resourceId, f.resourceId));
  if (f.clientId) conds.push(eq(projects.clientId, f.clientId));
  if (f.projectId) conds.push(eq(deployments.projectId, f.projectId));
  if (f.deploymentId) conds.push(eq(deployments.id, f.deploymentId));

  const rows = await db
    .select({
      id: timesheetEntries.id,
      deploymentId: timesheetEntries.deploymentId,
      entryDate: timesheetEntries.entryDate,
      entryType: timesheetEntries.entryType,
      hours: timesheetEntries.hours,
      task: timesheetEntries.task,
      taskKind: timesheetEntries.taskKind,
      status: timesheetEntries.status,
      reviewedBy: users.name,
      reviewedAt: timesheetEntries.reviewedAt,
      rejectionReason: timesheetEntries.rejectionReason,
      resourceId: resources.id,
      resourceName: resources.name,
      clientId: clients.id,
      clientName: clients.companyName,
      projectName: projects.projectName,
      deploymentType: deployments.deploymentType,
      fullDayHours: deployments.fullDayHours,
    })
    .from(timesheetEntries)
    .innerJoin(deployments, eq(timesheetEntries.deploymentId, deployments.id))
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(users, eq(timesheetEntries.reviewedByUserId, users.id))
    .where(and(...conds))
    .all();

  // What makes a day a holiday, and what leave was approved, to judge each day fairly.
  const cal = await db
    .select({ date: holidays.holidayDate, name: holidays.name, clientId: holidays.clientId })
    .from(holidays)
    .where(and(gte(holidays.holidayDate, f.from), lte(holidays.holidayDate, f.to)))
    .all();
  const leaveByResource = new Map<number, Map<string, number>>();
  for (const resourceId of new Set(rows.map((r) => r.resourceId))) {
    const hol = new Set(cal.map((h) => h.date));
    const m = new Map<string, number>();
    for (const l of await leaveDaysInRange(db, resourceId, f.from, f.to, hol, ['approved'])) m.set(l.date, (m.get(l.date) ?? 0) + l.fraction);
    leaveByResource.set(resourceId, m);
  }

  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.deploymentId}:${r.entryDate}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  let days: ActivityDay[] = [...groups.entries()].map(([key, list]) => {
    const first = list[0];
    const work = list.filter((r) => r.entryType === 'work');
    const total = work.reduce((s, r) => s + r.hours, 0);
    const legacyLeave = list.filter((r) => r.entryType === 'paid_leave' || r.entryType === 'unpaid_leave').reduce((s, r) => s + r.hours, 0);
    const fraction = Math.min(1, leaveByResource.get(first.resourceId)?.get(first.entryDate) ?? 0);
    const calendar = cal.find((h) => h.date === first.entryDate && (h.clientId === null || h.clientId === first.clientId));
    const marked = list.find((r) => r.entryType === 'holiday');
    const holidayName = calendar?.name ?? (marked ? (marked.task ?? 'Holiday') : null);
    const expected = expectedHours(first.fullDayHours, legacyLeave + fraction * first.fullDayHours);
    const wd = new Date(`${first.entryDate}T00:00:00Z`).getUTCDay();
    const tone = dayTone({ worked: total, expected, holiday: holidayName !== null, weekend: wd === 0 || wd === 6, date: first.entryDate, today });

    // The same task name on one day is one entry in the summary.
    const tasks = new Map<string, { label: string; hours: number; fixed: boolean }>();
    for (const r of work) {
      const fixed = r.taskKind === 'no_client_tasks';
      const label = fixed ? TASK_KIND_LABELS.no_client_tasks : (r.task?.trim() || 'General work');
      const t = tasks.get(label) ?? { label, hours: 0, fixed };
      t.hours += r.hours;
      tasks.set(label, t);
    }
    const decided = list.find((r) => r.reviewedBy || r.reviewedAt);
    return {
      key,
      date: first.entryDate,
      resourceId: first.resourceId,
      resourceName: first.resourceName,
      clientName: first.clientName,
      projectName: first.projectName,
      billable: first.deploymentType === 'billable',
      total: Math.round(total * 100) / 100,
      expected,
      tone,
      reason: dayReason({ tone, worked: total, expected, fullDayHours: first.fullDayHours }),
      holidayName,
      tasks: [...tasks.values()],
      leave: legacyLeave > 0 || fraction > 0 ? { hours: legacyLeave + fraction * first.fullDayHours, fromRequest: fraction > 0 } : null,
      status: dayStatus(list.map((r) => r.status)),
      reviewedBy: decided?.reviewedBy ?? null,
      reviewedAt: decided?.reviewedAt ?? null,
      rejectionReason: list.find((r) => r.rejectionReason)?.rejectionReason ?? null,
      entries: list.map((r) => ({ id: r.id, entryType: r.entryType, hours: r.hours, task: r.task, taskKind: r.taskKind, status: r.status })),
    };
  });

  if (f.status) days = days.filter((d) => d.status === f.status);
  days.sort((a, b) => a.resourceName.localeCompare(b.resourceName) || b.date.localeCompare(a.date));

  const page = Math.max(1, f.page);
  return { days: days.slice((page - 1) * ACTIVITY_PAGE, page * ACTIVITY_PAGE), total: days.length, page, pageSize: ACTIVITY_PAGE };
}

/* ── Figures for the links on other screens (FR-TSH-014) ───── */

export function currentMonth(today: string): { from: string; to: string } {
  const from = `${today.slice(0, 7)}-01`;
  return { from, to: endOfMonth(from) };
}

/** This month's figures for one resource, for the Resource page. */
export async function resourceMonth(resourceId: number, today: string) {
  const f: DashFilters = { ...currentMonth(today), resourceId };
  const { deps, entries } = await loadWindow(f);
  if (!deps.length) return null;
  return { period: { from: f.from, to: f.to }, ...resourceStats(deps, entries, f.from, f.to) };
}

/** This month's figures for one deployment, for the Deployment page. */
export async function deploymentMonth(deploymentId: number, today: string) {
  const f: DashFilters = { ...currentMonth(today), deploymentId };
  const { deps, entries } = await loadWindow(f);
  if (!deps.length) return null;
  return { period: { from: f.from, to: f.to }, ...deploymentStats(deps[0], entries, f.from, f.to) };
}

/** How much of each line of an invoice has approved timesheets, for the Invoice page. */
export async function invoiceCoverage(invoiceId: number) {
  const inv = await db
    .select({ projectId: invoices.projectId, from: invoices.periodFrom, to: invoices.periodTo })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .get();
  if (!inv) return null;
  const lines = await db
    .select({ resourceId: invoiceResources.resourceId, resourceName: resources.name })
    .from(invoiceResources)
    .innerJoin(resources, eq(invoiceResources.resourceId, resources.id))
    .where(eq(invoiceResources.invoiceId, invoiceId))
    .all();
  const out: { resourceName: string; approvedDays: number; expectedDays: number }[] = [];
  for (const l of lines) {
    const s = await lineSummary(db, { resourceId: l.resourceId, projectId: inv.projectId, from: inv.from, to: inv.to });
    out.push({ resourceName: l.resourceName, approvedDays: s.approvedDays, expectedDays: s.expectedDays });
  }
  return { period: { from: inv.from, to: inv.to }, projectId: inv.projectId, lines: out };
}
