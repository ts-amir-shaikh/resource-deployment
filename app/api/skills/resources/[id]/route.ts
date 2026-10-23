import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { resourceSkillsSchema } from '@/lib/validations';
import { setResourceSkills } from '@/lib/reviews';
import { reviewed } from '@/lib/review-api';

export const dynamic = 'force-dynamic';

/** A resource's skill levels, saved together. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);
    const { data, error } = await parseBody(req, resourceSkillsSchema);
    if (error) return error;
    const session = await requireSession();
    return reviewed(async () => {
      await setResourceSkills(session.uid, id, data);
      return ok({ saved: true });
    });
  });
}
