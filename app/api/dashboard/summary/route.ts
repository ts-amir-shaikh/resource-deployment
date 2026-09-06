import { handle, ok } from '@/lib/api';
import {
  getDashboardSummary,
  getInvoiceSummary,
  syncExpiredAgreements,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => {
    await syncExpiredAgreements();
    return ok({ ...getDashboardSummary(), invoices: await getInvoiceSummary() });
  });
}
