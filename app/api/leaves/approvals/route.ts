import { handle, ok, parseBody } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { leaveReviewSchema } from '@/lib/validations';
import { leaveQueue, reviewLeave } from '@/lib/leaves';
import { leaveFailure } from '@/lib/leave-api';

export const dynamic = 'force-dynamic';

/** Pending leave and the last few decisions. Resource Manager, Admin; Management reads. */
export async function GET() {
  return handle(async () => ok(await leaveQueue()));
}

/** Approve or reject one pending request. Writes are the Resource Manager's and Admin's (lib/access.ts). */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, leaveReviewSchema);
    if (error) return error;
    try {
      const session = await requireSession();
      await reviewLeave(session.uid, data);
      return ok({ reviewed: data.id });
    } catch (e) {
      return leaveFailure(e);
    }
  });
}
