import { handle, ok, fail, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { personEvents } from '@/lib/accounts/people';

export const dynamic = 'force-dynamic';

/**
 * One account's log (R19). Admin only (R22): middleware lets Management read
 * everything under /api, so this route refuses them itself.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    if (viewer.role !== 'admin') return fail('Only Admin can read the account log.', 403);
    const id = parseId(params.id);
    if (!id) return fail('Invalid account id', 400);
    return ok(await personEvents(id));
  });
}
