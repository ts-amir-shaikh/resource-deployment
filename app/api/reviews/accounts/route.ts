import { handle, ok, parseBody } from '@/lib/api';
import { getViewer, requireSession } from '@/lib/session';
import { accountReviewStartSchema } from '@/lib/validations';
import { listAccountReviews, startAccountReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Account reviews across months. Sales gets the approved ones of its own clients (Q5). */
export async function GET() {
  return handle(async () => ok(await listAccountReviews(await getViewer())));
}

/** Opens a client's review for a month, or returns the one already open. */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, accountReviewStartSchema);
    if (error) return error;
    const session = await requireSession();
    return reviewed(async () => ok({ id: await startAccountReview(session.uid, data) }, 201));
  });
}
