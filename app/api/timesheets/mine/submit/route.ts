import { handle, ok, parseBody } from '@/lib/api';
import { timesheetSubmitSchema } from '@/lib/validations';
import { submitRange } from '@/lib/timesheets';
import { currentResource, timesheetFailure } from '@/lib/timesheet-api';

export const dynamic = 'force-dynamic';

/** Sends the draft and rejected days in a range for approval. */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, timesheetSubmitSchema);
    if (error) return error;
    try {
      const { resourceId } = await currentResource();
      return ok({ submitted: await submitRange(resourceId, data) });
    } catch (e) {
      return timesheetFailure(e);
    }
  });
}
