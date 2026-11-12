import { datesBetween, isExpectedDay } from './timesheet-rules';

/**
 * M62 slice C (G-ACC-06): the pure parts of drafting a month's invoices.
 */

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Weekdays in the month that are not holidays: the "working days" a line bills against. */
export function workingDaysInMonth(from: string, to: string, holidays: ReadonlySet<string>): number {
  return datesBetween(from, to).filter((d) => isExpectedDay(d, holidays)).length;
}

/**
 * One draft per project, agreement and currency. Currencies are never mixed on
 * an invoice, and a PO is billed on its own invoice.
 */
export function draftKey(d: { projectId: number; agreementId: number | null; currency: string }): string {
  return `${d.projectId}|${d.agreementId ?? 'none'}|${d.currency}`;
}
