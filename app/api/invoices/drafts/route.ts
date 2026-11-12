import { db } from '@/lib/db';
import { monthlyDraftSchema } from '@/lib/validations';
import { handle, ok, parseBody } from '@/lib/api';
import { buildMonthlyDrafts } from '@/lib/invoice-drafts';
import { holidaysBetween } from '@/lib/holidays';
import { withTimesheetLeave } from '@/lib/timesheets';

export const dynamic = 'force-dynamic';

/**
 * M62 slice C (G-ACC-06): "Draft this month's invoices". Creates Not Raised
 * drafts from billable deployments and returns what was created and what was
 * skipped and why. Idempotent for a month: a second run creates nothing.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, monthlyDraftSchema);
    if (error) return error;
    const result = await db.transaction((tx) =>
      buildMonthlyDrafts(tx, data.month, {
        holidaysFor: async (t, from, to, clientIds) =>
          new Set((await holidaysBetween(t, from, to, clientIds)).map((h) => h.date)),
        leaveFor: withTimesheetLeave,
      }),
    );
    return ok(result, 201);
  });
}
