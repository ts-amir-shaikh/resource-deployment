import { handle, ok, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { leadCreateSchema } from '@/lib/validations';
import { createLeadOnClient, listLeads } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const sp = new URL(req.url).searchParams;
    return ok(await listLeads(viewer, { status: sp.get('status') || undefined, q: sp.get('q')?.trim() || undefined }));
  });
}

/** Q5: a lead on an existing client. Leads from prospects are made by /prospects/[id]/convert. */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const { data, error } = await parseBody(req, leadCreateSchema);
    if (error) return error;
    return leadgen(async () => ok(await createLeadOnClient(viewer, data), 201));
  });
}
