import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadApplications } from '@/lib/lists/load/candidates';
import { applicationsList } from '@/lib/lists/applications';

export const dynamic = 'force-dynamic';

/** CSV of the applications list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: applicationsList, rows: await loadApplications() });
  });
}
