import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadCandidates } from '@/lib/lists/load/candidates';
import { candidatesList } from '@/lib/lists/candidates';

export const dynamic = 'force-dynamic';

/** CSV of the candidates list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: candidatesList, rows: await loadCandidates() });
  });
}
