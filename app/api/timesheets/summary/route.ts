import { handle, ok, fail, parseId } from '@/lib/api';
import { db } from '@/lib/db';
import { lineSummary } from '@/lib/timesheets';
import { isIsoDate } from '@/lib/timesheet-rules';

export const dynamic = 'force-dynamic';

/**
 * Approved timesheet figures for one invoice line, for the invoice form to
 * pre-fill. Back office only (lib/access.ts). The save path does not trust
 * what the form sends back — it calls lineSummary() itself.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const resourceId = parseId(p.get('resourceId') ?? '');
    const projectId = parseId(p.get('projectId') ?? '');
    const from = p.get('from') ?? '';
    const to = p.get('to') ?? '';
    if (!resourceId || !projectId || !isIsoDate(from) || !isIsoDate(to) || to < from) {
      return fail('resourceId, projectId and a valid from/to are required', 422);
    }
    return ok(await lineSummary(db, { resourceId, projectId, from, to }));
  });
}
