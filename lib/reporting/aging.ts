import { daysBetweenIso } from './dates';

/**
 * Invoice aging, as a pure function of the due date and the as-of date (both
 * Asia/Kolkata calendar dates). An invoice due today is not yet overdue; it is
 * one day past due tomorrow. Only invoices still owed (raised or pending
 * collection) are aged; see invoices.ts.
 */

export type AgingBucket = 'notYetDue' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90plus' | 'noDueDate';

export const AGING_BUCKETS: readonly AgingBucket[] = ['notYetDue', 'd1_30', 'd31_60', 'd61_90', 'd90plus', 'noDueDate'];

/** Whole days past the due date; null with no due date; 0 or negative means not yet due. */
export function daysPastDue(dueDate: string | null, asOf: string): number | null {
  if (!dueDate) return null;
  return daysBetweenIso(dueDate, asOf);
}

export function bucketFor(dueDate: string | null, asOf: string): AgingBucket {
  const days = daysPastDue(dueDate, asOf);
  if (days === null) return 'noDueDate';
  if (days <= 0) return 'notYetDue';
  if (days <= 30) return 'd1_30';
  if (days <= 60) return 'd31_60';
  if (days <= 90) return 'd61_90';
  return 'd90plus';
}
