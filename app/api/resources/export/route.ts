import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadResources } from '@/lib/lists/load/resources';
import { resourcesList } from '@/lib/lists/resources';

export const dynamic = 'force-dynamic';

/** CSV of the resources list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: resourcesList, rows: await loadResources() });
  });
}
