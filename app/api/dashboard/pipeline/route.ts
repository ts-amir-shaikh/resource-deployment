import { handle, ok } from '@/lib/api';
import { getPipelineSummary, getDueFollowUps } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () =>
    ok({ ...getPipelineSummary(), dueFollowUps: await getDueFollowUps() }),
  );
}
