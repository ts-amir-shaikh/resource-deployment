import { handle, ok, fail, fieldErrors, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { reviewSubmitSchema } from '@/lib/validations';
import { actOnPerformanceReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/**
 * The Resource Manager locks the review and sends it to Admin. It becomes the
 * next version; from the second version on, `changeNote` says what changed.
 * The body is optional, so a first submit needs none.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    const body = await req.json().catch(() => ({}));
    const parsed = reviewSubmitSchema.safeParse(body);
    if (!parsed.success) return fail('Please correct the highlighted fields', 422, { fields: fieldErrors(parsed.error) });
    const session = await requireSession();
    return reviewed(async () => ok({ status: await actOnPerformanceReview(session.uid, id, 'submit', { changeNote: parsed.data.changeNote }) }));
  });
}
