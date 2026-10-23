import { handle, ok, parseBody } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { performanceReviewStartSchema } from '@/lib/validations';
import { startPerformanceReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Opens a deployment's review for a month, or returns the one already open. */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, performanceReviewStartSchema);
    if (error) return error;
    const session = await requireSession();
    return reviewed(async () => ok({ id: await startPerformanceReview(session.uid, data) }, 201));
  });
}
