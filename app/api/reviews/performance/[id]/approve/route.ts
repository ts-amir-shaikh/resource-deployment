import { handle, ok, fail, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { actOnPerformanceReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Q3: Admin signs the review off. Only Admin reaches this (lib/access.ts). */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    const session = await requireSession();
    return reviewed(async () => ok({ status: await actOnPerformanceReview(session.uid, id, 'approve') }));
  });
}
