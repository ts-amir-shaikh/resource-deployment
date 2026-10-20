import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadProjects } from '@/lib/lists/load/projects';
import { projectsList } from '@/lib/lists/projects';

export const dynamic = 'force-dynamic';

/** CSV of the projects list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: projectsList, rows: await loadProjects() });
  });
}
