/**
 * Leave rules (FSD-21) — pure, and safe to import from client components.
 *
 * A leave request is a range of dates, paid or unpaid, approved by the
 * Resource Manager. Days are never stored: they are counted from the dates and
 * the holiday calendar whenever they are needed, so a holiday added later
 * cannot leave a stale figure behind (the same rule as timesheet days, BR-TSH-08).
 */
import { datesBetween, isExpectedDay } from './timesheet-rules';

export const LEAVE_TYPES = ['paid', 'unpaid'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  paid: 'Paid',
  unpaid: 'Unpaid',
};

export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

/** A request this long is a typing mistake, not a leave. */
export const MAX_LEAVE_SPAN_DAYS = 92;

export type LeaveRange = { startDate: string; endDate: string; halfDay: boolean };

export type LeaveDay = { date: string; /** 1 for a whole day, 0.5 for a half day. */ fraction: number };

/**
 * The working days a request takes. A weekend or a holiday inside the range
 * costs nothing — leave across a long weekend is not billed leave for the
 * weekend. A half day is one working day at 0.5, and only a one-day request
 * can be a half day (checked on the way in).
 */
export function expandLeave(r: LeaveRange, holidays: ReadonlySet<string>): LeaveDay[] {
  const fraction = r.halfDay ? 0.5 : 1;
  return datesBetween(r.startDate, r.endDate)
    .filter((d) => isExpectedDay(d, holidays))
    .map((date) => ({ date, fraction }));
}

export function leaveDays(r: LeaveRange, holidays: ReadonlySet<string>): number {
  return expandLeave(r, holidays).reduce((s, d) => s + d.fraction, 0);
}

export function rangesOverlap(a: Pick<LeaveRange, 'startDate' | 'endDate'>, b: Pick<LeaveRange, 'startDate' | 'endDate'>): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/** Only a pending request moves, and only to one of these three. */
export function canMove(from: LeaveStatus, to: LeaveStatus): boolean {
  return from === 'pending' && (to === 'approved' || to === 'rejected' || to === 'cancelled');
}

/** Leave the invoice feed and the dashboard count: approved only. */
export function countsAsLeave(status: LeaveStatus): boolean {
  return status === 'approved';
}
