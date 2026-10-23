/**
 * Mock leave requests for FSD-21, so the My Leaves screen, the leave approval
 * queue and the timesheet's leave marks have something to show. Additive only:
 *
 * - does nothing if `leave_requests` already has rows;
 * - inserts requests for resources that already have a deployment: one
 *   pending and one approved for the first, an approved half day and a
 *   rejected one for the second, all in the coming fortnight or just past;
 * - never updates or deletes a row, and creates no accounts. The reviewer is
 *   the first Resource Manager account, else the first Admin.
 *
 *   npm run db:migrate          # first — the table must exist
 *   npm run db:seed-leaves
 *
 * Targets TURSO_DATABASE_URL when set, otherwise the local libSQL file.
 */
import { createClient } from '@libsql/client';
import { shiftDate, weekStart } from '../lib/timesheet-rules';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });

const today = new Date().toISOString().slice(0, 10);

async function main() {
  const { rows: t } = await client.execute("select name from sqlite_master where type='table' and name = 'leave_requests'");
  if (!t.length) {
    console.error('The leave_requests table does not exist yet. Run `npm run db:migrate` first.');
    process.exit(1);
  }
  const existing = Number((await client.execute('select count(*) c from leave_requests')).rows[0].c);
  if (existing > 0) {
    console.log(`leave_requests already has ${existing} rows — nothing added.`);
    return;
  }

  const { rows: people } = await client.execute('select distinct resource_id from deployments order by resource_id limit 2');
  if (!people.length) {
    console.log('No deployed resources — nothing to add leave for.');
    return;
  }
  const first = Number(people[0].resource_id);
  const second = people[1] ? Number(people[1].resource_id) : null;

  const reviewer = (
    await client.execute("select id from users where role in ('resource_manager', 'admin') and active = 1 order by case role when 'resource_manager' then 0 else 1 end, id limit 1")
  ).rows[0];
  const by = reviewer ? Number(reviewer.id) : null;

  const nextMonday = shiftDate(weekStart(today), 7);
  const rows: [number, string, string, number, string, string, string | null, string | null][] = [
    // resource, start, end, half, type, status, reason, rejection
    [first, nextMonday, shiftDate(nextMonday, 2), 0, 'paid', 'pending', 'Family function', null],
    [first, shiftDate(nextMonday, 4), shiftDate(nextMonday, 4), 1, 'unpaid', 'approved', 'Personal work', null],
  ];
  if (second) {
    rows.push([second, shiftDate(nextMonday, 1), shiftDate(nextMonday, 1), 0, 'paid', 'approved', 'Medical appointment', null]);
    rows.push([second, shiftDate(nextMonday, 7), shiftDate(nextMonday, 11), 0, 'paid', 'rejected', 'Holiday trip', 'Release week: please pick other dates']);
  }
  for (const [resourceId, start, end, half, type, status, reason, rejection] of rows) {
    await client.execute({
      sql: `insert into leave_requests (resource_id, start_date, end_date, half_day, leave_type, status, reason,
                                         reviewed_by_user_id, reviewed_at, rejection_reason)
            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [resourceId, start, end, half, type, status, reason, status === 'pending' ? null : by, status === 'pending' ? null : `${today}T09:00:00.000Z`, rejection],
    });
  }
  console.log(`Added ${rows.length} mock leave request(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
