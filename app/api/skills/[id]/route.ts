import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { skillUpdateSchema } from '@/lib/validations';
import { updateSkill } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** Rename, retire or restore a skill. Never delete: recorded levels stay readable. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid skill id', 400);
    const { data, error } = await parseBody(req, skillUpdateSchema);
    if (error) return error;
    return reviewed(async () => {
      await updateSkill(id, data);
      return ok({ saved: true });
    });
  });
}
