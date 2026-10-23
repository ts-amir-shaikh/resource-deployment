/**
 * Mock timesheet data for M65, so the timesheet, approval and invoice screens
 * have something to show. Additive only:
 *
 * - does nothing if `timesheet_entries` already has rows;
 * - inserts holidays and entries against deployments that already exist;
 * - the one update it makes is giving a single deployment the task version
 *   (v2) when that deployment has no version set, so both entry screens can
 *   be seen;
 * - dashboard cases (FSD-18 v1.1): when no row carries a task kind yet, marks
 *   a few existing approved work rows as "No client tasks assigned" — whole
 *   days on the first billable deployment, and one half-day on the task
 *   version deployment — so the dashboard has billed-but-idle time to show.
 *   This runs even when the entries above already exist, and only on rows
 *   that are mock data.
 *
 *   npm run db:migrate          # first — the tables must exist
 *   npm run db:seed-timesheets
 *
 * Targets TURSO_DATABASE_URL when set, otherwise the local libSQL file.
 */
import { createClient } from '@libsql/client';
import { datesBetween, isExpectedDay, shiftDate, weekStart } from '../lib/timesheet-rules';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });

type Dep = { id: number; resourceId: number; clientId: number; startDate: string; endDate: string | null };

const today = new Date().toISOString().slice(0, 10);

/** First and last day of the month before `date`. */
function previousMonth(date: string): { from: string; to: string } {
  const firstOfThis = `${date.slice(0, 7)}-01`;
  const to = shiftDate(firstOfThis, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}

/** The first weekday on or after `date`. */
function weekdayOnOrAfter(date: string): string {
  let d = date;
  while (!isExpectedDay(d, new Set())) d = shiftDate(d, 1);
  return d;
}

async function insertEntry(
  deploymentId: number,
  date: string,
  entryType: string,
  hours: number,
  task: string | null,
  status: string,
  rejectionReason: string | null = null,
) {
  await client.execute({
    sql: `insert into timesheet_entries
            (deployment_id, entry_date, entry_type, hours, task, status, submitted_at, reviewed_at, rejection_reason)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      deploymentId,
      date,
      entryType,
      hours,
      task,
      status,
      status === 'draft' ? null : `${date}T18:00:00.000Z`,
      status === 'approved' || status === 'rejected' ? `${date}T20:00:00.000Z` : null,
      rejectionReason,
    ],
  });
}

/** Marks a few existing approved work rows as the fixed task (D17). Idempotent. */
async function seedNoClientTasks() {
  const tagged = Number((await client.execute('select count(*) c from timesheet_entries where task_kind is not null')).rows[0].c);
  if (tagged > 0) {
    console.log('Some entries already carry a task kind — no dashboard cases added.');
    return;
  }
  // Whole days: the first billable deployment's last three approved work days.
  const whole = await client.execute(`
    select e.id from timesheet_entries e join deployments d on d.id = e.deployment_id
     where d.deployment_type = 'billable' and e.entry_type = 'work' and e.status = 'approved'
       and e.hours >= 8 and e.task_kind is null
     order by d.id, e.entry_date desc limit 3`);
  // A split day: a 3-hour approved row on a task-version (v2) deployment.
  const split = await client.execute(`
    select e.id from timesheet_entries e join deployments d on d.id = e.deployment_id
     where d.deployment_type = 'billable' and d.timesheet_version = 'v2' and e.entry_type = 'work'
       and e.status = 'approved' and e.hours = 3 and e.task_kind is null
     order by e.entry_date desc limit 1`);
  const ids = [...whole.rows, ...split.rows].map((r) => Number(r.id));
  for (const id of ids) {
    await client.execute({
      sql: "update timesheet_entries set task_kind = 'no_client_tasks', task = null where id = ?",
      args: [id],
    });
  }
  console.log(ids.length ? `Marked ${ids.length} approved row(s) as "No client tasks assigned".` : 'No suitable approved rows to mark.');
}

async function main() {
  const { rows: tables } = await client.execute(
    "select name from sqlite_master where type='table' and name in ('timesheet_entries', 'holidays')",
  );
  if (tables.length < 2) {
    console.error('The timesheet tables do not exist yet. Run `npm run db:migrate` first.');
    process.exit(1);
  }
  const existing = Number((await client.execute('select count(*) c from timesheet_entries')).rows[0].c);
  if (existing > 0) {
    console.log(`timesheet_entries already has ${existing} rows — no timesheet rows added.`);
    await seedNoClientTasks();
    return;
  }

  const { rows } = await client.execute(`
    select d.id, d.resource_id as resourceId, p.client_id as clientId, d.start_date as startDate,
           d.end_date as endDate, d.timesheet_version as version
      from deployments d join projects p on p.id = d.project_id
     where d.status = 'active'
     order by d.id
     limit 4`);
  const deps: (Dep & { version: string | null })[] = rows.map((r) => ({
    id: Number(r.id),
    resourceId: Number(r.resourceId),
    clientId: Number(r.clientId),
    startDate: String(r.startDate),
    endDate: r.endDate ? String(r.endDate) : null,
    version: r.version ? String(r.version) : null,
  }));
  if (!deps.length) {
    console.log('No active deployments to record time against — seed deployments first.');
    return;
  }

  // Holidays: one company-wide last month, one for the first client this month.
  const last = previousMonth(today);
  const companyHoliday = weekdayOnOrAfter(`${last.from.slice(0, 7)}-15`);
  const clientHoliday = weekdayOnOrAfter(shiftDate(weekStart(today), 14));
  await client.execute({
    sql: 'insert into holidays (client_id, holiday_date, name) values (null, ?, ?), (?, ?, ?)',
    args: [companyHoliday, 'Company holiday (mock)', deps[0].clientId, clientHoliday, 'Client holiday (mock)'],
  });
  const companyHolidays = new Set([companyHoliday]);

  // The second deployment shows the task version (v2), if it has no setting.
  const v2 = deps[1] && !deps[1].version ? deps[1].id : null;
  if (v2) await client.execute({ sql: "update deployments set timesheet_version = 'v2' where id = ?", args: [v2] });

  const inWindow = (d: Dep, date: string) => date >= d.startDate && (!d.endDate || date <= d.endDate);
  let count = 0;

  for (const [i, d] of deps.entries()) {
    const isV2 = d.id === v2;

    // Last month: every expected day approved, so invoices can draw on it.
    // The first deployment also carries one unpaid day, one paid day and a
    // half day, so the invoice pre-fill has leave to show.
    const days = datesBetween(last.from, last.to).filter((date) => inWindow(d, date));
    // Counts working days only, so the leave below lands on weekdays.
    let n = -1;
    for (const date of days) {
      if (companyHolidays.has(date)) {
        await insertEntry(d.id, date, 'holiday', 0, 'Company holiday (mock)', 'approved');
        count++;
        continue;
      }
      if (!isExpectedDay(date, companyHolidays)) continue;
      n++;
      if (i === 0 && n === 3) {
        await insertEntry(d.id, date, 'unpaid_leave', 8, 'Personal leave', 'approved');
      } else if (i === 0 && n === 8) {
        await insertEntry(d.id, date, 'paid_leave', 8, 'Sick leave', 'approved');
      } else if (i === 0 && n === 12) {
        await insertEntry(d.id, date, 'work', 4, 'Morning standup and fixes', 'approved');
        await insertEntry(d.id, date, 'paid_leave', 4, 'Half day', 'approved');
        count++;
      } else if (isV2) {
        await insertEntry(d.id, date, 'work', 5, 'Feature development', 'approved');
        await insertEntry(d.id, date, 'work', 3, 'Code review and meetings', 'approved');
        count++;
      } else {
        await insertEntry(d.id, date, 'work', 8, 'Project work', 'approved');
      }
      count++;
    }

    // This week: Monday–Wednesday submitted, Thursday rejected, Friday a draft —
    // something in every state for the approval queue and the resource's screen.
    const monday = weekStart(today);
    const plan: [number, string, string | null][] = [
      [0, 'submitted', null],
      [1, 'submitted', null],
      [2, 'submitted', null],
      [3, 'rejected', 'Hours look short for a full day — please check'],
      [4, 'draft', null],
    ];
    for (const [offset, status, reason] of plan) {
      const date = shiftDate(monday, offset);
      if (!inWindow(d, date)) continue;
      const hours = status === 'rejected' ? 3 : 8;
      if (isV2) {
        await insertEntry(d.id, date, 'work', hours / 2, 'Sprint tasks', status, reason);
        await insertEntry(d.id, date, 'work', hours / 2, 'Client calls', status, reason);
        count += 2;
      } else {
        await insertEntry(d.id, date, 'work', hours, 'Project work', status, reason);
        count++;
      }
    }
  }

  const { rows: linked } = await client.execute(`
    select u.email, r.name from users u join resources r on r.id = u.resource_id
     where u.role = 'resource' and u.active = 1`);
  const withTime = new Set(deps.map((d) => d.resourceId));
  await seedNoClientTasks();
  console.log(`Added ${count} timesheet rows across ${deps.length} deployment(s), and 2 holidays.`);
  if (v2) console.log(`Deployment ${v2} now uses the task version (v2).`);
  console.log(`Resources with time: ${[...withTime].join(', ')}`);
  for (const r of linked) console.log(`  resource login ${r.email} → ${r.name}`);
  if (!linked.length) console.log('  No resource login is linked yet — link one on the People screen to see /timesheet.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
