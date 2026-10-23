import { handle, ok, parseBody } from '@/lib/api';
import { leaveApplySchema } from '@/lib/validations';
import { applyLeave, myLeaves } from '@/lib/leaves';
import { leaveFailure } from '@/lib/leave-api';
import { currentResource } from '@/lib/timesheet-api';

export const dynamic = 'force-dynamic';

/** The resource's own leave requests. Middleware opens the door; this reads only their rows. */
export async function GET() {
  return handle(async () => {
    try {
      const { resourceId } = await currentResource();
      return ok(await myLeaves(resourceId));
    } catch (e) {
      return leaveFailure(e);
    }
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, leaveApplySchema);
    if (error) return error;
    try {
      const { uid, resourceId } = await currentResource();
      return ok(await applyLeave(resourceId, uid, data), 201);
    } catch (e) {
      return leaveFailure(e);
    }
  });
}
