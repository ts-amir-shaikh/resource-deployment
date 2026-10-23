/**
 * The weekly timesheet screen's logic (FSD-18) — pure, and safe to import from
 * client components.
 *
 * The screen shows a week as one card per day and edits one day at a time.
 * Storage is unchanged: rows of (deployment, date, type, hours, task). Leave is
 * not entered here: it comes from approved leave requests (FSD-21).
 */
import {
  shiftDate,
  weekDates,
  weekStart,
  type EntryStatus,
  type EntryType,
  type TaskKind,
} from './timesheet-rules';

/* ── The grid: tasks down, days across ─────────────────────── */

export type SavedEntry = {
  entryDate: string;
  entryType: EntryType;
  hours: number;
  task: string | null;
  taskKind: TaskKind | null;
};

export type DayRowInput = { entryType: EntryType; hours: number; task?: string; taskKind?: TaskKind };

export type GridRow = {
  /** Stable for the life of the screen, so editing a name never moves its cells. */
  key: string;
  /** The task's name, as typed or chosen. */
  label: string;
  /** Hours as typed, by date. Empty or missing means nothing entered. */
  cells: Record<string, string>;
};

/** Hours typed into a box: null when it is not a usable number. Empty is 0. */
export function parseHours(s: string | undefined): number | null {
  if (s === undefined || s.trim() === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function hoursIn(row: GridRow, date: string): number {
  return parseHours(row.cells[date]) ?? 0;
}

/** The fixed task (D17) is chosen by name like any task, and stored as a kind, never as text. */
function isFixedTask(label: string, fixedLabel: string): boolean {
  return label.trim().toLowerCase() === fixedLabel.toLowerCase();
}

/**
 * Rows for one deployment's saved work: one per task name, in the order first
 * seen. There is no starter row and no fixed row: a person adds the tasks they
 * worked on. Hours logged against the fixed "No client tasks assigned" task
 * show under that name. Leave and holiday rows are not shown here (leave is
 * FSD-21).
 */
export function buildGrid(entries: readonly SavedEntry[], fixedLabel: string): GridRow[] {
  const rows: GridRow[] = [];
  const byLabel = new Map<string, GridRow>();
  let n = 0;
  for (const e of entries) {
    if (e.entryType !== 'work') continue;
    const label = e.taskKind === 'no_client_tasks' ? fixedLabel : (e.task ?? '').trim();
    let row = byLabel.get(label);
    if (!row) {
      row = { key: `t${n++}`, label, cells: {} };
      byLabel.set(label, row);
      rows.push(row);
    }
    row.cells[e.entryDate] = String(Math.round(((parseHours(row.cells[e.entryDate]) ?? 0) + e.hours) * 100) / 100);
  }
  return rows;
}

/** Hours entered on a date, across every row. Unusable boxes count as 0. */
export function gridDayTotal(grid: readonly GridRow[], date: string): number {
  return Math.round(grid.reduce((s, r) => s + hoursIn(r, date), 0) * 100) / 100;
}

/** How many rows have hours on a date — a version 1 deployment allows one. */
export function gridDayRowCount(grid: readonly GridRow[], date: string): number {
  return grid.filter((r) => hoursIn(r, date) > 0).length;
}

export function savedDayRows(entries: readonly SavedEntry[], date: string): DayRowInput[] {
  return entries
    .filter((e) => e.entryDate === date)
    .map((e) => ({
      entryType: e.entryType,
      hours: e.hours,
      ...(e.task ? { task: e.task } : {}),
      ...(e.taskKind ? { taskKind: e.taskKind } : {}),
    }));
}

/**
 * The rows to store for one date. Leave rows saved before leave moved to its
 * own screen are passed through untouched, so editing the work cannot delete
 * them (a day is replaced as a whole). A holiday row is kept only while there
 * is no work: working on a holiday replaces the suggestion.
 */
export function dayRowsFromGrid(grid: readonly GridRow[], date: string, saved: readonly SavedEntry[], fixedLabel: string): DayRowInput[] {
  const rows: DayRowInput[] = [];
  for (const r of grid) {
    const hours = hoursIn(r, date);
    if (hours <= 0) continue;
    if (isFixedTask(r.label, fixedLabel)) rows.push({ entryType: 'work', hours, taskKind: 'no_client_tasks' });
    else rows.push({ entryType: 'work', hours, ...(r.label.trim() ? { task: r.label.trim() } : {}) });
  }
  const own = saved.filter((e) => e.entryDate === date);
  for (const e of own) {
    if (e.entryType === 'paid_leave' || e.entryType === 'unpaid_leave') {
      rows.push({ entryType: e.entryType, hours: e.hours, ...(e.task ? { task: e.task } : {}) });
    }
  }
  if (!rows.some((r) => r.entryType === 'work')) {
    for (const e of own) if (e.entryType === 'holiday') rows.push({ entryType: 'holiday', hours: e.hours, ...(e.task ? { task: e.task } : {}) });
  }
  return rows;
}

/** Order-independent form of a day's rows, to tell whether anything changed. */
export function daySignature(rows: readonly DayRowInput[]): string {
  return JSON.stringify(
    rows
      .map((r) => [r.entryType, r.hours, r.task ?? '', r.taskKind ?? ''])
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  );
}

/* ── How a day reads ───────────────────────────────────────── */

export type DayTone = 'holiday' | 'leave' | 'ok' | 'short' | 'over' | 'rest' | 'wait';

/**
 * The hours a person is expected to work on a day: the full day less any leave
 * that is approved for it (or entered before leave moved to its own screen).
 * Never below zero.
 */
export function expectedHours(fullDayHours: number, leaveHours: number): number {
  return Math.max(0, fullDayHours - leaveHours);
}

/**
 * A holiday is always a holiday, whatever was entered. A whole day of leave is
 * leave. A weekend is quiet. A working day is green at exactly what was
 * expected, red short or over — except an empty day that has not happened yet,
 * which is simply not filled in yet.
 */
export function dayTone(o: { worked: number; expected: number; holiday: boolean; weekend: boolean; date: string; today: string }): DayTone {
  if (o.holiday) return 'holiday';
  if (o.expected === 0) return o.weekend ? 'rest' : 'leave';
  if (o.weekend) return 'rest';
  if (Math.abs(o.worked - o.expected) < 1e-9) return 'ok';
  if (o.worked === 0 && o.date >= o.today) return 'wait';
  return o.worked > o.expected ? 'over' : 'short';
}

/**
 * The words under a day's total, so a colour is never a puzzle: "4.75 h short",
 * "1 h over", "Full day". When half-day leave moved what was expected, it says
 * so ("5 h over · 4 h expected (half-day leave)"). Empty for a day that is not
 * measured (holiday, weekend, waiting, whole-day leave).
 */
export function dayReason(o: { tone: DayTone; worked: number; expected: number; fullDayHours: number }): string {
  const num = (n: number) => String(Math.round(n * 100) / 100);
  const onLeave = o.expected < o.fullDayHours && o.expected > 0;
  const why = onLeave ? ` · ${num(o.expected)} h expected (half-day leave)` : '';
  if (o.tone === 'short') return `${num(o.expected - o.worked)} h short${why}`;
  if (o.tone === 'over') return `${num(o.worked - o.expected)} h over${why}`;
  if (o.tone === 'ok') return onLeave ? 'Full day (half-day leave)' : 'Full day';
  return '';
}

/** When a day holds several rows, the status that needs attention first. */
export function dayStatus(statuses: readonly EntryStatus[]): EntryStatus | null {
  for (const s of ['rejected', 'submitted', 'draft', 'approved'] as const) if (statuses.includes(s)) return s;
  return null;
}

/* ── Weeks and months ──────────────────────────────────────── */

/** ISO 8601 week number: week 1 holds the year's first Thursday. */
export function isoWeekNumber(date: string): number {
  const d = new Date(`${date}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // the Thursday of this week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** The distinct months a run of dates touches, in order. */
export function monthsIn(dates: readonly string[]): string[] {
  return [...new Set(dates.map(monthKey))];
}

/** First and last day of a `YYYY-MM`. */
export function monthBounds(month: string): { from: string; to: string } {
  const from = `${month}-01`;
  const next = new Date(`${from}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: shiftDate(next.toISOString().slice(0, 10), -1) };
}

export function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

/**
 * A week is filled in one month at a time (a week across two months is two
 * pieces, one per month), because a month is what is approved and invoiced.
 * These are the pieces of one month, in order: the dates of each week that fall
 * in it, and the Monday of that week to load it by.
 */
export function weeksOfMonth(month: string): { week: string; dates: string[]; number: number }[] {
  const { from, to } = monthBounds(month);
  const out: { week: string; dates: string[]; number: number }[] = [];
  for (let w = weekStart(from); w <= to; w = shiftDate(w, 7)) {
    const dates = weekDates(w).filter((d) => monthKey(d) === month);
    if (dates.length) out.push({ week: w, dates, number: isoWeekNumber(w) });
  }
  return out;
}

/** The months a deployment can be filled in: from its start to the month after today, or its end. */
export function monthChoices(startDate: string, endDate: string | null, today: string): string[] {
  const first = monthKey(startDate);
  const last = endDate && endDate < today ? monthKey(endDate) : shiftMonth(monthKey(today), 1);
  const out: string[] = [];
  for (let m = last; m >= first && out.length < 60; m = shiftMonth(m, -1)) out.push(m);
  return out; // newest first
}
