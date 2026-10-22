import { handle, ok, parseBody } from '@/lib/api';
import { timesheetDaySchema } from '@/lib/validations';
import { saveDay } from '@/lib/timesheets';
import { currentResource, timesheetFailure } from '@/lib/timesheet-api';

export const dynamic = 'force-dynamic';

/** Replaces one day of one of the resource's own deployments. */
export async function PUT(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, timesheetDaySchema);
    if (error) return error;
    try {
      const { uid, resourceId } = await currentResource();
      await saveDay(resourceId, uid, data);
      return ok({ saved: true });
    } catch (e) {
      return timesheetFailure(e);
    }
  });
}
