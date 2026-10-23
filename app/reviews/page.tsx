import { requireCurrentAccount } from '@/lib/session';
import { canWrite } from '@/lib/access';
import { listCriteria, reviewTracker } from '@/lib/reviews';
import { periodParam } from '@/lib/review-api';
import { periodOf } from '@/lib/review-rules';
import { today } from '@/lib/utils';
import ReviewsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Reviews · Resource Deployment' };

/**
 * M67 (G-RM-05): the month's reviews — an account review per client and a
 * performance review per deployment active that month — and how far each
 * has got. Resource Manager writes, Admin approves, Management reads.
 */
export default async function ReviewsPage({ searchParams }: { searchParams: { period?: string } }) {
  const session = await requireCurrentAccount();
  // A malformed ?period falls back to this month rather than erroring.
  const period = periodParam(searchParams.period) ?? periodOf(today());
  const [tracker, criteria] = await Promise.all([reviewTracker(period), listCriteria()]);
  return (
    <ReviewsClient
      tracker={tracker}
      criteria={criteria}
      canWrite={canWrite(session.role, '/api/reviews/performance')}
    />
  );
}
