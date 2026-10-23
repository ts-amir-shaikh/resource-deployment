import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { leadAssignSchema } from '@/lib/validations';
import { assignLead } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/** Q2: a Sales head or Admin picks the salesperson. Middleware keeps Leadgen out. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid lead id', 400);
    const { data, error } = await parseBody(req, leadAssignSchema);
    if (error) return error;
    return leadgen(async () => ok(await assignLead(viewer, id, data)));
  });
}
