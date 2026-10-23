import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { reviewCriterionUpdateSchema } from '@/lib/validations';
import { updateCriterion } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Rename, reorder, retire or restore. Never delete: past scores stay readable. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid criterion id', 400);
    const { data, error } = await parseBody(req, reviewCriterionUpdateSchema);
    if (error) return error;
    return reviewed(async () => {
      await updateCriterion(id, data);
      return ok({ saved: true });
    });
  });
}
