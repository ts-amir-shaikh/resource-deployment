import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { leadHandoffSchema } from '@/lib/validations';
import { handOffLead } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/** Q2: into the Sales queue. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid lead id', 400);
    const { data, error } = await parseBody(req, leadHandoffSchema);
    if (error) return error;
    return leadgen(async () => ok(await handOffLead(viewer, id, data)));
  });
}
