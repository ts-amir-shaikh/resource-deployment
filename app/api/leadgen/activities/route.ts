import { handle, ok, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { activitySchema } from '@/lib/validations';
import { followUpsDue, logActivity } from '@/lib/leadgen';
import { leadgen } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/** The follow-ups due on what this viewer can see (R2). Timelines come with the prospect and lead pages. */
export async function GET() {
  return handle(async () => ok(await followUpsDue(await getViewer())));
}

export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    const { data, error } = await parseBody(req, activitySchema);
    if (error) return error;
    return leadgen(async () => ok(await logActivity(viewer, data), 201));
  });
}
