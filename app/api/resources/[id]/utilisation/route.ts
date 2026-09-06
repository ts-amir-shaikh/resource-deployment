import { handle, ok, fail, parseId } from '@/lib/api';
import { getResourceAllocation } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);
    return ok(await getResourceAllocation(id));
  });
}
