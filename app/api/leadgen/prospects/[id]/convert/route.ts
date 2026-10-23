import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { leadConvertSchema } from '@/lib/validations';
import { convertProspect } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/** D4 / Q3: a qualified prospect becomes a lead. Not "Onboard as client" — that is /convert-client on a requirement. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid prospect id', 400);
    const { data, error } = await parseBody(req, leadConvertSchema);
    if (error) return error;
    return leadgen(async () => ok(await convertProspect(viewer, id, data), 201));
  });
}
