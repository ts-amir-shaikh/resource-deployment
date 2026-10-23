import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { campaignSchema } from '@/lib/validations';
import { getCampaignDetail, updateCampaign } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid campaign id', 400);
    const detail = await getCampaignDetail(viewer, id);
    return detail ? ok(detail) : fail('Campaign not found', 404);
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid campaign id', 400);
    const { data, error } = await parseBody(req, campaignSchema);
    if (error) return error;
    return leadgen(async () => ok(await updateCampaign(viewer, id, data)));
  });
}
