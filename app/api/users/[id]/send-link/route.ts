import { handle, ok, fail, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { appOrigin, sendPasswordLink } from '@/lib/accounts/service';

export const dynamic = 'force-dynamic';

/**
 * Send link (R7): emails the account a single-use link to set a password —
 * a first invite or a reset alike. Admin only; middleware already refuses
 * Management's writes, and this refuses every other role explicitly.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    if (viewer.role !== 'admin') return fail('Only Admin can send password links.', 403);
    const id = parseId(params.id);
    if (!id) return fail('Invalid account id', 400);

    const result = await sendPasswordLink(id, viewer.uid, appOrigin(req));
    if (!result.ok) return fail(result.reason, result.status);
    return ok({ sent: true, to: result.to });
  });
}
