import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadDeployments } from '@/lib/lists/load/deployments';
import { deploymentsList } from '@/lib/lists/deployments';

export const dynamic = 'force-dynamic';

/** CSV of the deployments list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: deploymentsList, rows: await loadDeployments() });
  });
}
