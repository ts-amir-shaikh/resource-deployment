import { handle, ok, parseBody } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { skillSchema } from '@/lib/validations';
import { createSkill, skillMatrix } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** G-RM-02: the catalogue and every resource's levels. No CTC or billing field is in it. */
export async function GET() {
  return handle(async () => ok(await skillMatrix()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, skillSchema);
    if (error) return error;
    const session = await requireSession();
    return reviewed(async () => ok(await createSkill(session.uid, data.name), 201));
  });
}
