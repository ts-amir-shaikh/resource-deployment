/**
 * Timesheet rules (M65) — pure, and safe to import from client components.
 *
 * Everything that turns hours into billable days lives here, so the entry
 * screen's running total, the approval queue and the invoice feed cannot each
 * settle the arithmetic differently. Server-side reads are in lib/timesheets.ts.
 */

/**
 * D10/D11. Both versions write the same rows: v1 is one row a day, v2 is one
 * row per task with its duration. The version only changes the entry screen.
 */
export const TIMESHEET_VERSIONS = ['v1', 'v2'] as const;
export type TimesheetVersion = (typeof TIMESHEET_VERSIONS)[number];

export const TIMESHEET_VERSION_LABELS: Record<TimesheetVersion, string> = {
  v1: 'Daily',
  v2: 'Tasks',
};

/**
 * What a row records. There is no "half day" type: half a day is four hours of
 * work beside four of leave, which the hours already say. A separate type
 * would be a second way to write the same day, and the two could disagree.
 */
export const ENTRY_TYPES = ['work', 'paid_leave', 'unpaid_leave', 'holiday'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  work: 'Work',
  paid_leave: 'Paid leave',
  unpaid_leave: 'Unpaid leave',
  holiday: 'Holiday',
};

export const ENTRY_STATUSES = ['draft', 'submitted', 'approved', 'rejected'] as const;
export type EntryStatus = (typeof ENTRY_STATUSES)[number];

export const ENTRY_STATUS_LABELS: Record<EntryStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

/** D3: how the Resource Manager's queue is grouped. It never blocks entry. */
export const APPROVAL_CADENCES = ['daily', 'weekly', 'monthly'] as const;
export type ApprovalCadence = (typeof APPROVAL_CADENCES)[number];

export const APPROVAL_CADENCE_LABELS: Record<ApprovalCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** D9: a full day, unless the deployment says otherwise. */
export const DEFAULT_FULL_DAY_HOURS = 8;

/** D18: the company's standard day, which a resource's capacity is measured against. */
export const STANDARD_DAY_HOURS = 8;

/**
 * D18: the hours a day a deployment opens with — the standard day scaled by
 * its allocation, to the half hour. 50% gives 4. Only a starting point; the
 * form lets Admin change it, and the deployment's own value is what counts.
 */
export function defaultHoursPerDay(allocationPercentage: number): number {
  const raw = (STANDARD_DAY_HOURS * allocationPercentage) / 100;
  if (!Number.isFinite(raw) || raw <= 0) return STANDARD_DAY_HOURS;
  return Math.min(MAX_DAY_HOURS, Math.max(0.5, Math.round(raw * 2) / 2));
}

/**
 * D17: a fixed task every billable project has, so time that is billed but
 * has no client work behind it can be told apart. Stored as a kind on the row
 * (never as free text), so renaming the label cannot orphan old rows. It is
 * an ordinary work row for billing: BR-TSH-12.
 */
export const TASK_KINDS = ['no_client_tasks'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  no_client_tasks: 'No client tasks assigned',
};

/** A day cannot hold more than this, whatever the rows say. */
export const MAX_DAY_HOURS = 24;

/** D10: the deployment's own setting wins; otherwise the project's default. */
export function effectiveVersion(
  deploymentVersion: string | null | undefined,
  projectVersion: string | null | undefined,
): TimesheetVersion {
  if (deploymentVersion === 'v1' || deploymentVersion === 'v2') return deploymentVersion;
  if (projectVersion === 'v2') return 'v2';
  return 'v1';
}

/** Only these may be edited by the resource. Approved is locked; submitted waits. */
export function isEditable(status: EntryStatus): boolean {
  return status === 'draft' || status === 'rejected';
}

/** To the nearest half day — the same rule invoice leave already uses (Q1). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/* ── Dates ─────────────────────────────────────────────────── */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(s: string): boolean {
  return ISO.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
}

function utc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const d = utc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return utc(date).getUTCDay();
}

/** The Monday of the week `date` falls in. */
export function weekStart(date: string): string {
  const back = (weekday(date) + 6) % 7;
  return shiftDate(date, -back);
}

/** Monday to Sunday. */
export function weekDates(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => shiftDate(start, i));
}

/** Every date from `from` to `to`, inclusive. Empty when the range is reversed. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = shiftDate(d, 1)) out.push(d);
  return out;
}

/**
 * A day the resource is expected to account for: Monday to Friday and not a
 * holiday. Weekend work can still be recorded, but a missing weekend is not a
 * shortfall and is not counted as leave.
 */
export function isExpectedDay(date: string, holidays: ReadonlySet<string>): boolean {
  const w = weekday(date);
  return w !== 0 && w !== 6 && !holidays.has(date);
}

/** The key the approval queue groups by, per D3's cadence setting. */
export function periodKey(date: string, cadence: ApprovalCadence): string {
  if (cadence === 'daily') return date;
  if (cadence === 'monthly') return date.slice(0, 7);
  return weekStart(date);
}

/* ── Hours → days (D9) ─────────────────────────────────────── */

export type DayRow = { entryType: EntryType; hours: number };

export type DayValue = {
  /** Marked as a holiday — neither worked nor leave. */
  holiday: boolean;
  /** Days of work, 0 to 1, in half days. */
  worked: number;
  /** Paid leave, billed (invoiceLineMath does not deduct it). */
  paidLeave: number;
  /** Unpaid leave, which comes off the bill. */
  unpaidLeave: number;
};

/**
 * What one day is worth for billing.
 *
 *   worked      = hours worked ÷ full-day hours, capped at 1, to the half day
 *   paid leave  = paid-leave hours ÷ full-day hours, up to what is left
 *   unpaid      = whatever is left of the day
 *
 * The last line is Q2: on an expected day, any part not accounted for as work
 * or paid leave is unpaid. Without it, logging four hours and nothing else
 * would bill a full day — the shortfall has to land somewhere, and leaving it
 * unrecorded is the one answer that silently overcharges the client.
 *
 * A day that is not expected (weekend, holiday) carries no shortfall: only the
 * work done on it is reported, and it adds nothing to leave.
 */
export function dayValue(rows: readonly DayRow[], fullDayHours: number, expected: boolean): DayValue {
  const full = fullDayHours > 0 ? fullDayHours : DEFAULT_FULL_DAY_HOURS;
  const hoursOf = (t: EntryType) =>
    rows.filter((r) => r.entryType === t).reduce((s, r) => s + Math.max(0, r.hours), 0);

  const worked = roundHalf(Math.min(1, hoursOf('work') / full));

  if (rows.some((r) => r.entryType === 'holiday')) {
    return { holiday: true, worked, paidLeave: 0, unpaidLeave: 0 };
  }
  if (!expected) {
    return { holiday: false, worked, paidLeave: 0, unpaidLeave: 0 };
  }

  const paidLeave = Math.min(1 - worked, roundHalf(Math.min(1, hoursOf('paid_leave') / full)));
  const unpaidLeave = Math.max(0, 1 - worked - paidLeave);
  return { holiday: false, worked, paidLeave, unpaidLeave };
}

/** Total hours on a day, for the entry screen's running total. */
export function dayHours(rows: readonly DayRow[]): number {
  return rows.reduce((s, r) => s + Math.max(0, r.hours), 0);
}

/* ── Period summary (the invoice feed, G-RES-04) ───────────── */

export type SummaryEntry = DayRow & { entryDate: string; status: EntryStatus };

export type SummaryWindow = {
  /** The deployment's own days inside the invoice period. */
  from: string;
  to: string;
  fullDayHours: number;
  entries: readonly SummaryEntry[];
};

export type PeriodSummary = {
  /** Weekdays in the window that are not holidays. */
  expectedDays: number;
  /** Of those, how many have an approved entry. */
  approvedDays: number;
  workedDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  /**
   * Every expected day is approved — the only case in which the figures are
   * complete enough to replace what a biller typed (Q3).
   */
  complete: boolean;
};

/**
 * Totals approved entries over one or more deployment windows.
 *
 * Only APPROVED rows count. A submitted day is the resource's claim, not yet
 * the company's; billing on it would put an unapproved figure on a client
 * invoice. A day with any unapproved row is treated as not approved at all,
 * since a day is approved or rejected as a whole.
 */
export function periodSummary(
  windows: readonly SummaryWindow[],
  holidays: ReadonlySet<string>,
): PeriodSummary {
  let expectedDays = 0;
  let approvedDays = 0;
  let workedDays = 0;
  let paidLeaveDays = 0;
  let unpaidLeaveDays = 0;

  for (const w of windows) {
    const byDate = new Map<string, SummaryEntry[]>();
    for (const e of w.entries) {
      if (e.entryDate < w.from || e.entryDate > w.to) continue;
      const list = byDate.get(e.entryDate) ?? [];
      list.push(e);
      byDate.set(e.entryDate, list);
    }

    for (const date of datesBetween(w.from, w.to)) {
      const expected = isExpectedDay(date, holidays);
      if (expected) expectedDays++;
      const rows = byDate.get(date);
      if (!rows || !rows.every((r) => r.status === 'approved')) continue;
      if (expected) approvedDays++;
      const v = dayValue(rows, w.fullDayHours, expected);
      workedDays += v.worked;
      paidLeaveDays += v.paidLeave;
      unpaidLeaveDays += v.unpaidLeave;
    }
  }

  return {
    expectedDays,
    approvedDays,
    workedDays,
    paidLeaveDays,
    unpaidLeaveDays,
    complete: expectedDays > 0 && approvedDays === expectedDays,
  };
}

/** "11 of 22 days approved" — shown on an invoice line that stays manual. */
export function coverageLabel(s: Pick<PeriodSummary, 'approvedDays' | 'expectedDays'>): string {
  return `${s.approvedDays} of ${s.expectedDays} days approved`;
}
