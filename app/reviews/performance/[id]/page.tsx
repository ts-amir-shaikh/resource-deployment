import { notFound } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { parseId } from '@/lib/api';
import { canWrite } from '@/lib/access';
import { getPerformanceReview, ReviewError } from '@/lib/reviews';
import PerformanceReviewClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Performance review · Resource Deployment' };

/** One resource's review for one month on one engagement (G-RM-05), with client feedback (D13). */
export default async function PerformanceReviewPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const id = parseId(params.id);
  if (!id) notFound();
  let review;
  try {
    review = await getPerformanceReview(viewer, id);
  } catch (e) {
    if (e instanceof ReviewError && e.status === 404) notFound();
    throw e;
  }
  return (
    <PerformanceReviewClient
      review={review}
      canEdit={canWrite(viewer.role, `/api/reviews/performance/${id}`)}
      canApprove={canWrite(viewer.role, `/api/reviews/performance/${id}/approve`)}
    />
  );
}
