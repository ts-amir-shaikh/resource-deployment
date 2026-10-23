import 'server-only';
import { fail } from './api';
import { LeaveError } from './leaves';
import { TimesheetError } from './timesheets';

/** A LeaveError or TimesheetError becomes its own status; anything else is rethrown for handle(). */
export function leaveFailure(err: unknown) {
  if (err instanceof LeaveError || err instanceof TimesheetError) return fail(err.message, err.status);
  throw err;
}
