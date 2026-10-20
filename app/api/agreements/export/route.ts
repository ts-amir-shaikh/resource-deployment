import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadAgreements } from '@/lib/lists/load/agreements';
import { agreementsList } from '@/lib/lists/agreements';

export const dynamic = 'force-dynamic';

/** CSV of the agreements list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: agreementsList, rows: await loadAgreements() });
  });
}
