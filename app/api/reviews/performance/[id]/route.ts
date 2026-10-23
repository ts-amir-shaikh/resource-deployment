import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { performanceReviewSchema } from '@/lib/validations';
import { getPerformanceReview, savePerformanceReview } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    return reviewed(async () => ok(await getPerformanceReview(viewer, id)));
  });
}

/** Saves a draft: its text, client feedback and every score. */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid review id', 400);
    const { data, error } = await parseBody(req, performanceReviewSchema);
    if (error) return error;
    return reviewed(async () => {
      await savePerformanceReview(id, data);
      return ok({ saved: true });
    });
  });
}
