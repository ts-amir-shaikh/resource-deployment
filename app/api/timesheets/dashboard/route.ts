import { handle, ok, fail } from '@/lib/api';
import { loadDashboard, loadInvoicesTab, parseDashFilters } from '@/lib/timesheet-dashboard';
import { today } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Timesheet dashboard figures for a period (FSD-18 v1.1). Admin only — the
 * rule is in lib/access.ts, above the shortcut that lets Management in.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const f = parseDashFilters(new URL(req.url).searchParams, today());
    if (typeof f === 'string') return fail(f, 422);
    // The Invoices tab is fetched separately (it is the slow part).
    if (new URL(req.url).searchParams.get('part') === 'invoices') return ok(await loadInvoicesTab(f));
    return ok(await loadDashboard(f));
  });
}
