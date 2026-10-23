import { handle, ok, parseBody } from '@/lib/api';
import { reviewCriterionSchema } from '@/lib/validations';
import { createCriterion, listCriteria } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Q7: what performance reviews are scored on, retired ones included. */
export async function GET() {
  return handle(async () => ok(await listCriteria()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, reviewCriterionSchema);
    if (error) return error;
    return reviewed(async () => ok(await createCriterion(data), 201));
  });
}
