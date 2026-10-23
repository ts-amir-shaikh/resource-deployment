import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { reviewReturnSchema } from '@/lib/validations';
import { actOnPerformanceReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Q3: Admin sends the review back to draft, saying why. Only Admin reaches this (lib/access.ts). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    const { data, error } = await parseBody(req, reviewReturnSchema);
    if (error) return error;
    const session = await requireSession();
    return reviewed(async () => ok({ status: await actOnPerformanceReview(session.uid, id, 'return', data.reason) }));
  });
}
