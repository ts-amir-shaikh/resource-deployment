import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { accountReviewSchema } from '@/lib/validations';
import { getAccountReview, saveAccountReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    return reviewed(async () => ok(await getAccountReview(viewer, id)));
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    const { data, error } = await parseBody(req, accountReviewSchema);
    if (error) return error;
    return reviewed(async () => {
      await saveAccountReview(id, data);
      return ok({ saved: true });
    });
  });
}
