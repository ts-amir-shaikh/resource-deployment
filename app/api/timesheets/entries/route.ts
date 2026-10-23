import { handle, ok, fail } from '@/lib/api';
import { loadActivityDays, parseDashFilters } from '@/lib/timesheet-dashboard';
import { ENTRY_STATUSES, type EntryStatus } from '@/lib/timesheet-rules';
import { today } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** The activity log: one row per resource per day, with the entries behind it. Admin only. */
export async function GET(req: Request) {
  return handle(async () => {
    const p = new URL(req.url).searchParams;
    const f = parseDashFilters(p, today());
    if (typeof f === 'string') return fail(f, 422);
    const s = p.get('status') ?? '';
    const status = (ENTRY_STATUSES as readonly string[]).includes(s) ? (s as EntryStatus) : undefined;
    const page = Math.max(1, Number(p.get('page')) || 1);
    return ok(await loadActivityDays({ ...f, status, page }));
  });
}
