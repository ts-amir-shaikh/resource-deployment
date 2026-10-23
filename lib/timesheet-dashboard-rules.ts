/**
 * Timesheet dashboard rules (FSD-18 v1.1) — pure, and safe to import from
 * client components.
 *
 * Time only. Billing is the fixed monthly amount (D21), so nothing here reads
 * or computes money: utilisation is hours over hours. Only APPROVED rows count
 * toward a figure (BR-TSH-04); submitted time is reported beside it as
 * pending, never mixed in.
 */
import {
  STANDARD_DAY_HOURS,
  datesBetween,
  isExpectedDay,
  periodSummary,
  type EntryStatus,
  type EntryType,
  type PeriodSummary,
  type TaskKind,
} from './timesheet-rules';

export type DashDeployment = {
  id: number;
  resourceId: number;
  /** A shadow deployment is not billed (FSD-10); its work is shadow work. */
  billable: boolean;
  fullDayHours: number;
  startDate: string;
  endDate: string | null;
  /** Holidays that apply to the deployment's client, plus company-wide ones. */
  holidays: ReadonlySet<string>;
};

export type DashEntry = {
  deploymentId: number;
  entryDate: string;
  entryType: EntryType;
  hours: number;
  taskKind: TaskKind | null;
  status: EntryStatus;
};

/** Hours by what they were, for one resource, one deployment or the whole company. */
export type HourBuckets = {
  /** Approved work on billable deployments, including no-client-task hours. */
  clientWorkHours: number;
  /** Of clientWorkHours, those logged against the fixed task (D17). */
  noClientTaskHours: number;
  shadowHours: number;
  paidLeaveHours: number;
  unpaidLeaveHours: number;
  /** Holiday rows on a day that was expected — one the calendar did not already remove. */
  holidayHours: number;
  /** Submitted, waiting for the Resource Manager. */
  pendingHours: number;
  /** Rejected and not yet resubmitted. */
  rejectedHours: number;
};

export function emptyBuckets(): HourBuckets {
  return {
    clientWorkHours: 0,
    noClientTaskHours: 0,
    shadowHours: 0,
    paidLeaveHours: 0,
    unpaidLeaveHours: 0,
    holidayHours: 0,
    pendingHours: 0,
    rejectedHours: 0,
  };
}

/** One decimal, so 68.18 reads 68.2 and sums of hours do not show float dust. */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Utilisation as a percentage to one decimal — or null, never 0, when there
 * is nothing to measure against. A new joiner, or a month that is all
 * holidays, has no capacity; "0%" would read as idle.
 */
export function utilisation(hours: number, capacityHours: number): number | null {
  if (!(capacityHours > 0)) return null;
  return round1((hours / capacityHours) * 100);
}

/** The part of a deployment's life that falls inside the period, or null. */
export function windowIn(d: Pick<DashDeployment, 'startDate' | 'endDate'>, from: string, to: string): [string, string] | null {
  const a = d.startDate > from ? d.startDate : from;
  const b = d.endDate && d.endDate < to ? d.endDate : to;
  return a <= b ? [a, b] : null;
}

/** Expected working days of one deployment inside the period. */
export function deploymentExpectedDays(d: DashDeployment, from: string, to: string): number {
  const w = windowIn(d, from, to);
  if (!w) return 0;
  return datesBetween(w[0], w[1]).filter((date) => isExpectedDay(date, d.holidays)).length;
}

/**
 * Days a resource is expected to be working: the days any of their
 * deployments covers, counted once however many deployments overlap, and
 * expected for at least one of them. A new joiner is not measured against the
 * days before they started.
 */
export function resourceExpectedDays(deps: readonly DashDeployment[], from: string, to: string): number {
  const days = new Set<string>();
  for (const d of deps) {
    const w = windowIn(d, from, to);
    if (!w) continue;
    for (const date of datesBetween(w[0], w[1])) if (isExpectedDay(date, d.holidays)) days.add(date);
  }
  return days.size;
}

/** BR-TSH-09: expected working days × the company standard day. */
export function resourceCapacityHours(deps: readonly DashDeployment[], from: string, to: string): number {
  return resourceExpectedDays(deps, from, to) * STANDARD_DAY_HOURS;
}

/** BR-TSH-09: expected working days × the deployment's own hours a day. */
export function deploymentExpectedHours(d: DashDeployment, from: string, to: string): number {
  return deploymentExpectedDays(d, from, to) * d.fullDayHours;
}

/** More hours a day across a person's deployments than one standard day. */
export function overAllocated(deps: readonly Pick<DashDeployment, 'fullDayHours'>[]): boolean {
  return deps.reduce((s, d) => s + d.fullDayHours, 0) > STANDARD_DAY_HOURS;
}

/**
 * Sorts entries into buckets. Approved rows go into the hour buckets;
 * submitted and rejected rows only into pending / rejected. A draft is the
 * resource's own working copy and is not reported anywhere.
 */
export function bucketHours(entries: readonly DashEntry[], deps: ReadonlyMap<number, DashDeployment>): HourBuckets {
  const b = emptyBuckets();
  for (const e of entries) {
    const d = deps.get(e.deploymentId);
    if (!d) continue;
    const h = Math.max(0, e.hours);
    if (e.status === 'submitted') b.pendingHours += h;
    else if (e.status === 'rejected') b.rejectedHours += h;
    else if (e.status === 'approved') {
      if (e.entryType === 'work') {
        if (!d.billable) b.shadowHours += h;
        else {
          b.clientWorkHours += h;
          // The fixed task is only ever stored on billable rows (refused on
          // shadow), so counting it here cannot inflate shadow time.
          if (e.taskKind === 'no_client_tasks') b.noClientTaskHours += h;
        }
      } else if (e.entryType === 'paid_leave') b.paidLeaveHours += h;
      else if (e.entryType === 'unpaid_leave') b.unpaidLeaveHours += h;
      else if (e.entryType === 'holiday' && isExpectedDay(e.entryDate, d.holidays)) b.holidayHours += h;
    }
  }
  return b;
}

/** Fold buckets together, for a company-wide total. */
export function addBuckets(a: HourBuckets, b: HourBuckets): HourBuckets {
  return {
    clientWorkHours: a.clientWorkHours + b.clientWorkHours,
    noClientTaskHours: a.noClientTaskHours + b.noClientTaskHours,
    shadowHours: a.shadowHours + b.shadowHours,
    paidLeaveHours: a.paidLeaveHours + b.paidLeaveHours,
    unpaidLeaveHours: a.unpaidLeaveHours + b.unpaidLeaveHours,
    holidayHours: a.holidayHours + b.holidayHours,
    pendingHours: a.pendingHours + b.pendingHours,
    rejectedHours: a.rejectedHours + b.rejectedHours,
  };
}

/** BR-TSH-11. Never below zero: over-logging is not negative bench time. */
export function remainingHours(capacityHours: number, b: HourBuckets): number {
  const used = b.clientWorkHours + b.shadowHours + b.paidLeaveHours + b.unpaidLeaveHours + b.holidayHours;
  return Math.max(0, round1(capacityHours - used));
}

export type ResourceStats = HourBuckets & {
  capacityHours: number;
  taskedWorkHours: number;
  remainingHours: number;
  /** Client work (including no-client-task hours) ÷ capacity. Null with no capacity. */
  billableUtilisation: number | null;
  /** Client work with real tasks behind it ÷ capacity. */
  taskBackedUtilisation: number | null;
  /** Client work + shadow ÷ capacity. */
  totalUtilisation: number | null;
  overAllocated: boolean;
};

export function resourceStats(
  deps: readonly DashDeployment[],
  entries: readonly DashEntry[],
  from: string,
  to: string,
): ResourceStats {
  const byId = new Map(deps.map((d) => [d.id, d]));
  const b = bucketHours(entries, byId);
  const capacityHours = resourceCapacityHours(deps, from, to);
  const tasked = b.clientWorkHours - b.noClientTaskHours;
  return {
    ...b,
    capacityHours,
    taskedWorkHours: round1(tasked),
    remainingHours: remainingHours(capacityHours, b),
    billableUtilisation: utilisation(b.clientWorkHours, capacityHours),
    taskBackedUtilisation: utilisation(tasked, capacityHours),
    totalUtilisation: utilisation(b.clientWorkHours + b.shadowHours, capacityHours),
    overAllocated: overAllocated(deps),
  };
}

export type DeploymentStats = HourBuckets & {
  expectedDays: number;
  expectedHours: number;
  /** Approved work on this deployment, whichever kind it is. */
  approvedHours: number;
  /** Approved hours ÷ expected hours. */
  utilisation: number | null;
  coverage: PeriodSummary;
};

export function deploymentStats(
  d: DashDeployment,
  entries: readonly DashEntry[],
  from: string,
  to: string,
): DeploymentStats {
  const own = entries.filter((e) => e.deploymentId === d.id && e.entryDate >= from && e.entryDate <= to);
  const b = bucketHours(own, new Map([[d.id, d]]));
  const expectedHours = deploymentExpectedHours(d, from, to);
  const approvedHours = b.clientWorkHours + b.shadowHours;
  const w = windowIn(d, from, to);
  return {
    ...b,
    expectedDays: deploymentExpectedDays(d, from, to),
    expectedHours,
    approvedHours,
    utilisation: utilisation(approvedHours, expectedHours),
    coverage: periodSummary(
      w ? [{ from: w[0], to: w[1], fullDayHours: d.fullDayHours, entries: own }] : [],
      d.holidays,
    ),
  };
}
