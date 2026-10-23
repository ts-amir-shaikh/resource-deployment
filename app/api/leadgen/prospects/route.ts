import { handle, ok, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { prospectSchema } from '@/lib/validations';
import { createProspect, listProspects } from '@/lib/leadgen';
import { idParam, leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/**
 * M66 prospect list, scoped per row (Q4). Distinct from GET /api/prospects,
 * whose shape the requirement form's company picker relies on (KTD7).
 */
export async function GET(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const sp = new URL(req.url).searchParams;
    return ok(
      await listProspects(viewer, {
        q: sp.get('q')?.trim() || undefined,
        stage: sp.get('stage') || undefined,
        temperature: sp.get('temperature') || undefined,
        ownerUserId: idParam(sp.get('owner')),
        campaignId: idParam(sp.get('campaign')),
      }),
    );
  });
}

/** 409 with `duplicates` when the name looks taken (Q6); resend with confirmDuplicate to go ahead. */
export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const { data, error } = await parseBody(req, prospectSchema);
    if (error) return error;
    return leadgen(async () => ok(await createProspect(viewer, data), 201));
  });
}
