import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { accountSchema } from '@/lib/validations';
import { updatePerson } from '@/lib/accounts/people';

export const dynamic = 'force-dynamic';

/**
 * Edit an account, including deactivating and reactivating it (R1, R20).
 * Changes the person must feel at once raise the session version, so their
 * next request picks them up (R16).
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    if (viewer.role !== 'admin') return fail('Only Admin can change accounts.', 403);
    const id = parseId(params.id);
    if (!id) return fail('Invalid account id', 400);
    const { data, error } = await parseBody(req, accountSchema);
    if (error) return error;
    const result = await updatePerson(id, data, viewer.uid);
    if (!result.ok) return fail(result.message, result.status, { fields: result.fields });
    return ok({ id: result.id });
  });
}
