import { getViewer } from '@/lib/session';
import { listAccountReviews } from '@/lib/reviews';
import AccountReviewsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account Reviews · Resource Deployment' };

/**
 * M67: account reviews across months. The back office sees every one; Sales
 * sees the approved reviews of clients where it owns a requirement (Q5).
 */
export default async function AccountReviewsPage() {
  const viewer = await getViewer();
  return <AccountReviewsClient rows={await listAccountReviews(viewer)} isSales={viewer.role === 'sales'} />;
}
