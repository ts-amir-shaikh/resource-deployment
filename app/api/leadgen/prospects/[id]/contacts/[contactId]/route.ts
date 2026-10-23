import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { prospectContactSchema } from '@/lib/validations';
import { deleteContact, updateContact } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string; contactId: string } };

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    const contactId = parseId(params.contactId);
    if (!id || !contactId) return fail('Invalid id', 400);
    const { data, error } = await parseBody(req, prospectContactSchema);
    if (error) return error;
    return leadgen(async () => ok(await updateContact(viewer, id, contactId, data)));
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    const contactId = parseId(params.contactId);
    if (!id || !contactId) return fail('Invalid id', 400);
    return leadgen(async () => {
      await deleteContact(viewer, id, contactId);
      return ok({ ok: true });
    });
  });
}
