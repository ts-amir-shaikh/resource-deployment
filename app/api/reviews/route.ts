import { handle, ok, fail } from '@/lib/api';
import { reviewTracker } from '@/lib/reviews';
import { periodParam } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** G-RM-05: every review due in a month and how far each has got. */
export async function GET(req: Request) {
  return handle(async () => {
    const period = periodParam(new URL(req.url).searchParams.get('period'));
    if (!period) return fail('Use a month in the form YYYY-MM', 400);
    return ok(await reviewTracker(period));
  });
}
