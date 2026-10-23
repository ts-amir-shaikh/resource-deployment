import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { prospectContactSchema } from '@/lib/validations';
import { addContact } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid prospect id', 400);
    const { data, error } = await parseBody(req, prospectContactSchema);
    if (error) return error;
    return leadgen(async () => ok(await addContact(viewer, id, data), 201));
  });
}
