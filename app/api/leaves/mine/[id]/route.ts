import { handle, ok, fail, parseId } from '@/lib/api';
import { cancelLeave } from '@/lib/leaves';
import { leaveFailure } from '@/lib/leave-api';
import { currentResource } from '@/lib/timesheet-api';

export const dynamic = 'force-dynamic';

/** Withdraws one of the resource's own pending requests. */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid leave id', 400);
    try {
      const { resourceId } = await currentResource();
      await cancelLeave(resourceId, id);
      return ok({ cancelled: id });
    } catch (e) {
      return leaveFailure(e);
    }
  });
}
