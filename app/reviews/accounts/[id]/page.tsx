import { notFound } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { parseId } from '@/lib/api';
import { canWrite } from '@/lib/access';
import { getAccountReview, ReviewError } from '@/lib/reviews';
import AccountReviewClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Account review · Resource Deployment' };

/** One client's review for one month (G-RM-05). Out of reach reads as missing, like the API. */
export default async function AccountReviewPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const id = parseId(params.id);
  if (!id) notFound();
  let review;
  try {
    review = await getAccountReview(viewer, id);
  } catch (e) {
    if (e instanceof ReviewError && e.status === 404) notFound();
    throw e;
  }
  return (
    <AccountReviewClient
      review={review}
      canEdit={canWrite(viewer.role, `/api/reviews/accounts/${id}`)}
      canApprove={canWrite(viewer.role, `/api/reviews/accounts/${id}/approve`)}
      showPerformance={viewer.role !== 'sales'}
    />
  );
}
