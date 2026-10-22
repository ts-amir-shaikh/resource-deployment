import { handle, ok, parseBody } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { timesheetReviewSchema } from '@/lib/validations';
import { approvalQueue, reviewDays } from '@/lib/timesheets';

export const dynamic = 'force-dynamic';

/** Submitted days awaiting the Resource Manager (D2). */
export async function GET() {
  return handle(async () => ok(await approvalQueue()));
}

/** Approve, or reject with a reason, one or many whole days. */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, timesheetReviewSchema);
    if (error) return error;
    const session = await requireSession();
    return ok({ changed: await reviewDays(session.uid, data) });
  });
}
