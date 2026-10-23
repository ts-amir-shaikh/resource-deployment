import { handle, ok, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { campaignSchema } from '@/lib/validations';
import { createCampaign, listCampaigns } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/** Every campaign with its results, computed on read (KTD3). */
export async function GET() {
  return handle(async () => {
    await getViewer();
    return ok(await listCampaigns());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const { data, error } = await parseBody(req, campaignSchema);
    if (error) return error;
    return leadgen(async () => ok(await createCampaign(viewer, data), 201));
  });
}
