/**
 * Reporting dates are calendar dates in India (Asia/Kolkata, UTC+5:30), never
 * the server's or UTC's. A Vercel function runs in UTC, so between 18:30 and
 * midnight UTC the Indian date is already tomorrow: using `new Date()` there
 * would report an invoice due "today" as not yet due, and a renewal window
 * would start a day early.
 *
 * Pure and edge-safe. All arithmetic is on date-only strings via UTC
 * midnights, so it cannot drift with the machine's timezone or a DST change.
 */

export const REPORTING_TZ = 'Asia/Kolkata';

/** Today's date in Asia/Kolkata as YYYY-MM-DD. `now` is injectable for tests. */
export function istToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORTING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30 and the like). */
export function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toUtcMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `date` moved by `days` (negative goes back). */
export function addDaysIso(date: string, days: number): string {
  const dt = new Date(toUtcMs(date) + days * 86_400_000);
  return dt.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetweenIso(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}
