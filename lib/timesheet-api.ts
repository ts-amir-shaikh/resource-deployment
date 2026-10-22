import 'server-only';
import { fail } from './api';
import { requireSession } from './session';
import { linkedResourceId, TimesheetError } from './timesheets';
import { isIsoDate, weekDates } from './timesheet-rules';
import { today } from './utils';

/**
 * The resource behind the signed-in account, for the /api/timesheets/mine
 * routes. Middleware has already confined these paths to the resource role;
 * this resolves *which* resource, and refuses an account that is not linked
 * to one rather than guessing.
 */
export async function currentResource(): Promise<{ uid: number; resourceId: number }> {
  const session = await requireSession();
  const resourceId = await linkedResourceId(session.uid);
  if (!resourceId) {
    throw new TimesheetError('Your account is not linked to a resource record. Ask Admin to link it.', 403);
  }
  return { uid: session.uid, resourceId };
}

/** `from`/`to` from the query string, defaulting to the current week. */
export function rangeFrom(searchParams: URLSearchParams): { from: string; to: string } | null {
  const week = weekDates(today());
  const from = searchParams.get('from') || week[0];
  const to = searchParams.get('to') || week[6];
  if (!isIsoDate(from) || !isIsoDate(to) || to < from) return null;
  return { from, to };
}

/** A TimesheetError becomes its own status; anything else is rethrown for handle(). */
export function timesheetFailure(err: unknown) {
  if (err instanceof TimesheetError) return fail(err.message, err.status);
  throw err;
}
