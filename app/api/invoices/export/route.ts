import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadInvoices } from '@/lib/lists/load/invoices';
import { invoicesList } from '@/lib/lists/invoices';

export const dynamic = 'force-dynamic';

/** CSV of the invoices list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: invoicesList, rows: await loadInvoices() });
  });
}
