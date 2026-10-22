import { handle, ok, fail } from '@/lib/api';
import { loadMyTimesheet } from '@/lib/timesheets';
import { currentResource, rangeFrom, timesheetFailure } from '@/lib/timesheet-api';

export const dynamic = 'force-dynamic';

/** The signed-in resource's profile, deployments, entries and holidays for a range. */
export async function GET(req: Request) {
  return handle(async () => {
    const range = rangeFrom(new URL(req.url).searchParams);
    if (!range) return fail('Use a valid date range', 422);
    try {
      const { resourceId } = await currentResource();
      return ok(await loadMyTimesheet(resourceId, range.from, range.to));
    } catch (e) {
      return timesheetFailure(e);
    }
  });
}
