import { createClient, type Client } from '@libsql/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DDL } from '@/lib/ddl';
import { addDaysIso, istToday } from '@/lib/reporting/dates';

/**
 * A scratch libSQL FILE database with mock data, for the reporting tests.
 * Never the shared test Turso database, never anything real: every name below
 * is made up, and the "sentinel" values exist only so tests can prove they
 * never appear in a response.
 */

export const SENTINELS = [
  'Zed Sentinel',
  'sentinel.test',
  '+9100000',
  '987654',
  'INV-SENTINEL',
  'AGR-SENTINEL',
  'JD-SENTINEL',
  'NOTE-SENTINEL',
  'share-token-sentinel',
  'Cand Sentinel',
  'Manager Sentinel',
  'SPOC-SENTINEL',
  '424242',
  '515151',
];

export type Fixture = {
  client: Client;
  url: string;
  today: string;
  /** today + n days (Asia/Kolkata calendar). */
  d: (n: number) => string;
};

export async function createFixture(): Promise<Fixture> {
  const dir = mkdtempSync(path.join(tmpdir(), 'reporting-test-'));
  const url = `file:${path.join(dir, 'scratch.db')}`;
  const client = createClient({ url });
  await client.executeMultiple(DDL);

  const today = istToday();
  const d = (n: number) => addDaysIso(today, n);
  const run = (sql: string, args: (string | number | null)[] = []) => client.execute({ sql, args });

  /* Clients and projects (the SPOC and manager details are sentinels). */
  for (const [id, name] of [
    [1, 'Acme'],
    [2, 'Beta'],
    [3, 'Gamma'],
  ] as const) {
    await run(
      'INSERT INTO clients (id, company_name, spoc_name, spoc_email, spoc_mobile) VALUES (?, ?, ?, ?, ?)',
      [id, name, 'SPOC-SENTINEL', `spoc${id}@sentinel.test`, '+91000000009'],
    );
  }
  for (const [id, client_id, name] of [
    [1, 1, 'Acme Platform'],
    [2, 2, 'Beta Mobile'],
    [3, 3, 'Gamma Data'],
    [4, 1, 'Acme Support'],
  ] as const) {
    await run(
      'INSERT INTO projects (id, client_id, project_name, manager_name, manager_email) VALUES (?, ?, ?, ?, ?)',
      [id, client_id, name, 'Manager Sentinel', 'mgr@sentinel.test'],
    );
  }

  /* Resources. 7 has left. All carry sentinel names, contacts and CTC. */
  const resources: [number, string | null, string | null][] = [
    [1, 'Java', null],
    [2, 'Java', null],
    [3, 'React', null],
    [4, 'React', null],
    [5, null, null],
    [6, 'Java', null],
    [7, 'Java', d(-10)],
    [8, 'Go', null],
    [9, 'Java', null],
  ];
  for (const [id, skill, exit] of resources) {
    await run(
      `INSERT INTO resources (id, name, email, mobile, designation, current_ctc, revised_ctc, primary_skill, exit_date, exit_notes)
       VALUES (?, ?, ?, ?, ?, 987654, 987655, ?, ?, ?)`,
      [id, `Zed Sentinel ${id}`, `zed${id}@sentinel.test`, `+9100000000${id}`, 'Engineer', skill, exit, exit ? 'NOTE-SENTINEL' : null],
    );
  }

  /* Deployments: res, project, type, alloc, end, currency, billing, status */
  const deployments: [number, number, string, number, string | null, string, number, string][] = [
    [1, 1, 'billable', 100, d(20), 'INR', 100000, 'active'], // D1
    [2, 1, 'billable', 60, null, 'INR', 60000, 'active'], // D2  split 60/40
    [2, 2, 'billable', 40, null, 'INR', 40000, 'active'], // D3
    [3, 2, 'billable', 100, d(70), 'USD', 2000, 'active'], // D4
    [4, 3, 'billable', 80, d(200), 'AED', 8000, 'active'], // D5
    [4, 1, 'shadow', 20, null, 'INR', 0, 'active'], // D6
    [5, 4, 'shadow', 100, d(-20), 'INR', 0, 'active'], // D7 past its end date, still active
    [8, 1, 'billable', 100, d(-30), 'INR', 90000, 'ended'], // D8
    [9, 2, 'billable', 50, null, 'INR', 30000, 'active'], // D9
  ];
  for (const [res, proj, type, alloc, end, cur, billing, status] of deployments) {
    await run(
      `INSERT INTO deployments (resource_id, project_id, deployment_type, allocation_percentage, start_date, end_date,
         currency, billing_amount, commission_amount, operations_overhead, gst_applicable, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, 7, 0, ?)`,
      [res, proj, type, alloc, d(-300), end, cur, billing, status],
    );
  }

  /* Invoices: project, status, currency, amount, gst, invoice date, due date */
  const invoices: [number, string, string, number, number, string | null, string | null][] = [
    [1, 'raised', 'INR', 100000, 18000, d(-50), d(-45)], // I1 overdue 45d
    [1, 'pending_collection', 'INR', 50000, 9000, d(-20), d(-5)], // I2 overdue 5d
    [1, 'collected', 'INR', 80000, 14400, d(-200), d(-100)], // I3
    [1, 'not_raised', 'INR', 70000, 12600, null, null], // I4 draft
    [2, 'raised', 'USD', 2000, 0, d(-200), d(15)], // I5 not yet due
    [2, 'raised', 'INR', 10000, 0, d(-200), null], // I6 no due date
    [3, 'raised', 'INR', 30000, 5400, d(-200), d(-120)], // I7 overdue 120d
    [3, 'raised', 'AED', 5000, 0, d(-200), d(-3)], // I8 overdue 3d
  ];
  let n = 0;
  for (const [proj, status, cur, amount, gst, invDate, due] of invoices) {
    n++;
    await run(
      `INSERT INTO invoices (project_id, invoice_number, period_from, period_to, currency, fx_rate_to_inr, amount, gst_amount,
         invoice_date, due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, 83, ?, ?, ?, ?, ?, 'NOTE-SENTINEL')`,
      [proj, `INV-SENTINEL-${n}`, d(-90), d(-60), cur, amount, gst, invDate, due, status],
    );
  }

  /* Agreements: id, project, parent, status, currency, value, end, version */
  const agreements: [number, number, number | null, string, string, number, string, number][] = [
    [1, 1, null, 'renewed', 'INR', 100000, d(25), 1], // AG1 superseded by AG2
    [2, 1, 1, 'active', 'INR', 120000, d(390), 2], // AG2 head
    [3, 2, null, 'active', 'INR', 500000, d(40), 1], // AG3 expiring
    [4, 3, null, 'active', 'USD', 1000, d(-30), 1], // AG4 lapsed
    [5, 1, null, 'active', 'INR', 70000, d(35), 1], // AG5 has a successor but is still 'active' (inconsistent)
    [6, 1, 5, 'active', 'INR', 75000, d(400), 2], // AG6 successor of AG5
    [7, 2, null, 'expired', 'INR', 10000, d(-300), 1], // AG7 long gone
    [8, 3, null, 'active', 'AED', 9000, d(75), 1], // AG8 expiring in 61-90
  ];
  for (const [id, proj, parent, status, cur, value, end, version] of agreements) {
    await run(
      `INSERT INTO agreements (id, project_id, parent_agreement_id, agreement_number, title, currency, value,
         start_date, end_date, renewal_version, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOTE-SENTINEL')`,
      [id, proj, parent, `AGR-SENTINEL-${id}`, `Agreement ${id}`, cur, value, d(-400), end, version, status],
    );
  }

  /* Candidates (sentinel identity) */
  for (let id = 1; id <= 7; id++) {
    await run('INSERT INTO candidates (id, name, email, mobile, current_ctc, expected_ctc) VALUES (?, ?, ?, ?, 987654, 987655)', [
      id,
      `Cand Sentinel ${id}`,
      `cand${id}@sentinel.test`,
      `+9100000010${id}`,
    ]);
  }

  /* Opportunities: id, stage, required, client, next step */
  const opps: [number, string, number, number | null, string | null][] = [
    [1, 'interview', 3, 1, null],
    [2, 'candidate_mapping', 2, 2, null],
    [3, 'requirement', 1, null, d(-3)], // a prospect with a follow-up due
    [4, 'won', 2, 1, null],
    [5, 'lost', 1, 2, null],
    [6, 'hold', 1, 1, null],
    [7, 'agreement', 2, 1, null],
  ];
  for (const [id, stage, required, client, next] of opps) {
    await run(
      `INSERT INTO opportunities (id, client_id, company_name, title, required_count, stage, next_step_date, share_token,
         jd_content, budget_min, budget_max, deal_value)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'JD-SENTINEL', 424242, 424243, 515151)`,
      [id, client, client ? ['', 'Acme', 'Beta'][client] : 'Prospect Co', `Role ${id}`, required, stage, next, `share-token-sentinel-${id}`],
    );
  }

  /* Mappings: opportunity, candidate, status */
  const maps: [number, number, string][] = [
    [1, 1, 'selected'],
    [1, 2, 'offered'],
    [1, 3, 'joined'],
    [1, 4, 'selected'], // four in a filled status on a 3-position requirement
    [1, 5, 'rejected'],
    [2, 1, 'mapped'], // the same candidate on a second requirement
    [7, 6, 'joined'],
    [7, 7, 'withdrawn'],
  ];
  for (const [opp, cand, status] of maps) {
    await run('INSERT INTO opportunity_candidates (opportunity_id, candidate_id, status) VALUES (?, ?, ?)', [opp, cand, status]);
  }

  await run("INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, created_at) VALUES (4, 'agreement', 'won', datetime('now', '-10 days'))");
  await run("INSERT INTO opportunity_stage_history (opportunity_id, from_stage, to_stage, created_at) VALUES (5, 'interview', 'lost', datetime('now', '-200 days'))");

  return { client, url, today, d };
}

/** Every table's row count and a content fingerprint, to prove a read changed nothing. */
export async function snapshot(client: Client, exclude: string[] = []) {
  const tables = (
    await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  ).rows.map((r) => String(r.name));
  const out: Record<string, string> = {};
  for (const t of tables) {
    if (exclude.includes(t)) continue;
    const rows = (await client.execute(`SELECT * FROM "${t}" ORDER BY rowid`)).rows;
    out[t] = `${rows.length}:${JSON.stringify(rows.map((r) => Object.values(r)))}`;
  }
  return out;
}
