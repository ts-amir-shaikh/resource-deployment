/**
 * Mock leadgen data for M66, so the prospect, campaign and lead screens have
 * something to show. Additive only:
 *
 * - does nothing if `campaigns` already has rows;
 * - inserts campaigns, prospects (one at every stage, every temperature),
 *   contacts, activities and leads; never updates or deletes an existing row;
 * - owners are the Leadgen and Sales accounts that already exist (round
 *   robin), or nobody when there are none — it creates no accounts.
 *
 *   npm run db:migrate          # first — the tables must exist
 *   npm run db:seed-leadgen
 *
 * Targets TURSO_DATABASE_URL when set, otherwise the local libSQL file.
 */
import { createClient } from '@libsql/client';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;
const client = createClient({ url, authToken });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

async function insert(sql: string, args: unknown[]): Promise<number> {
  const r = await client.execute({ sql, args: args.map((v) => (v === undefined ? null : v)) as never });
  return Number(r.lastInsertRowid ?? 0);
}

async function ids(role: string): Promise<number[]> {
  const { rows } = await client.execute({
    sql: 'select id from users where role = ? and active = 1 order by id',
    args: [role],
  });
  return rows.map((r) => Number(r.id));
}

async function main() {
  const { rows: tables } = await client.execute(
    "select name from sqlite_master where type='table' and name in ('campaigns', 'prospect_contacts', 'leads', 'activities')",
  );
  if (tables.length < 4) {
    console.error('The leadgen tables do not exist yet. Run `npm run db:migrate` first.');
    process.exit(1);
  }
  const existing = Number((await client.execute('select count(*) c from campaigns')).rows[0].c);
  if (existing > 0) {
    console.log(`campaigns already has ${existing} rows — nothing added.`);
    return;
  }

  const leadgen = await ids('leadgen');
  const sales = await ids('sales');
  const lg = (i: number) => (leadgen.length ? leadgen[i % leadgen.length] : null);
  const sl = (i: number) => (sales.length ? sales[i % sales.length] : null);

  /* ── Campaigns ── */
  const campaigns = [
    ['BFSI Mumbai Q4', 'BFSI, Mumbai, 200+ staff', 'calls', day(-40), day(20), 'active', lg(0)],
    ['GCC LinkedIn push', 'Global capability centres, Pune & Bengaluru', 'linkedin', day(-25), day(35), 'active', lg(1)],
    ['NASSCOM summit follow-up', 'Event attendees', 'event', day(-70), day(-50), 'closed', lg(0)],
  ];
  const campaignIds: number[] = [];
  for (const c of campaigns) {
    campaignIds.push(
      await insert(
        `insert into campaigns (name, segment, channel, start_date, end_date, status, owner_user_id, created_by_user_id)
         values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [...c, c[6]],
      ),
    );
  }

  /* ── Prospects ── [company, stage, temperature, source, campaign index, industry, location, deadReason] */
  type P = [string, string, string, string, number | null, string, string, string | null];
  const prospects: P[] = [
    ['Nimbus FinTech Pvt Ltd', 'qualified', 'hot', 'campaign', 0, 'Fintech', 'Mumbai', null],
    ['Arcadia Insurance Brokers', 'meeting_set', 'warm', 'campaign', 0, 'Insurance', 'Mumbai', null],
    ['Kestrel Capital', 'contacted', 'cold', 'campaign', 0, 'Asset management', 'Mumbai', null],
    ['Harbourline Bank', 'new', 'cold', 'campaign', 0, 'Banking', 'Navi Mumbai', null],
    ['Vantage Payments', 'dead', 'cold', 'campaign', 0, 'Payments', 'Mumbai', 'Hiring frozen until next fiscal'],
    ['Orchid Health GCC', 'qualified', 'warm', 'campaign', 1, 'Healthcare', 'Bengaluru', null],
    ['Pillar Retail Tech Centre', 'contacted', 'warm', 'campaign', 1, 'Retail', 'Pune', null],
    ['Corvid Analytics LLP', 'meeting_set', 'hot', 'campaign', 1, 'Analytics', 'Pune', null],
    ['Tessellate Systems', 'converted', 'hot', 'event', 2, 'SaaS', 'Bengaluru', null],
    ['Lumen Logistics', 'converted', 'warm', 'event', 2, 'Logistics', 'Chennai', null],
    ['Quarry Labs', 'new', 'warm', 'referral', null, 'Edtech', 'Hyderabad', null],
    ['Brightwater Energy', 'contacted', 'cold', 'inbound', null, 'Energy', 'Gurugram', null],
  ];
  const prospectIds: number[] = [];
  for (const [i, p] of prospects.entries()) {
    const [name, stage, temperature, source, ci, industry, location, deadReason] = p;
    const id = await insert(
      `insert into prospects (company_name, stage, temperature, source, campaign_id, industry, location, dead_reason,
                              owner_user_id, created_by_user_id, updated_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, stage, temperature, source, ci === null ? null : campaignIds[ci], industry, location, deadReason, lg(i), lg(i), new Date().toISOString()],
    );
    prospectIds.push(id);
    const short = name.split(' ')[0].toLowerCase();
    await insert(
      `insert into prospect_contacts (prospect_id, name, designation, email, mobile, is_primary) values (?, ?, ?, ?, ?, 1)`,
      [id, ['Priya Nair', 'Rahul Mehta', 'Sneha Kulkarni', 'Arjun Rao'][i % 4], 'Head of Engineering', `cto@${short}.example`, '+91 98000 0' + String(1000 + i)],
    );
    if (i % 3 === 0) {
      await insert(`insert into prospect_contacts (prospect_id, name, designation, email, is_primary) values (?, ?, ?, ?, 0)`, [
        id,
        'Kavita Shah',
        'Talent Acquisition Lead',
        `hr@${short}.example`,
      ]);
    }
  }

  /* ── Activities ── [prospect index, type, days ago, outcome, notes, follow-up in days | null, attendees] */
  type A = [number, string, number, string | null, string, number | null, string | null];
  const activities: A[] = [
    [0, 'call', 30, 'interested', 'Payments rebuild needs Java and React people.', null, null],
    [0, 'meeting', 20, 'interested', 'Walked through the bench; asked for four profiles.', null, 'CTO, Head of Engineering'],
    [0, 'email', 10, 'follow_up', 'Sent rate card.', -1, null],
    [1, 'call', 15, 'meeting_booked', 'Booked a meeting with the CIO.', null, null],
    [1, 'meeting', 5, 'interested', 'Claims platform modernisation, Q1 start.', 3, 'CIO'],
    [2, 'call', 12, 'no_answer', 'Voicemail.', 0, null],
    [3, 'email', 3, null, 'Intro email sent.', 7, null],
    [4, 'call', 35, 'not_interested', 'Budget frozen.', null, null],
    [5, 'linkedin', 18, 'interested', 'Connected with the GCC head.', null, null],
    [5, 'meeting', 8, 'interested', 'Data platform team of 6.', null, 'GCC Head, Data Lead'],
    [6, 'linkedin', 9, 'follow_up', 'Asked to reconnect after their reorg.', -2, null],
    [7, 'call', 6, 'meeting_booked', 'Meeting next week.', 2, null],
    [8, 'event', 60, 'interested', 'Met at the summit stall.', null, null],
    [8, 'meeting', 52, 'interested', 'SRE team extension.', null, 'VP Engineering'],
    [9, 'event', 60, 'interested', 'Warehouse systems roles.', null, null],
    [11, 'call', 4, 'follow_up', 'Inbound enquiry; call back.', 1, null],
  ];
  for (const [pi, type, ago, outcome, notes, follow, attendees] of activities) {
    await insert(
      `insert into activities (prospect_id, campaign_id, type, activity_date, outcome, notes, next_follow_up, attendees, by_user_id)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        prospectIds[pi],
        prospects[pi][4] === null ? null : campaignIds[prospects[pi][4]!],
        type,
        day(-ago),
        outcome,
        notes,
        follow === null ? null : day(follow),
        attendees,
        lg(pi),
      ],
    );
  }

  /* ── Leads ── the two converted prospects: one still with Leadgen, one handed to Sales. */
  const now = new Date().toISOString();
  await insert(
    `insert into leads (prospect_id, company_name, title, summary, temperature, bant_budget, bant_need, bant_timeline,
                        status, lead_owner_user_id, created_by_user_id, updated_at)
     values (?, ?, ?, ?, 'hot', 1, 1, 1, 'open', ?, ?, ?)`,
    [prospectIds[8], prospects[8][0], '3 SRE engineers for platform team', 'Six-month extension, likely to grow.', lg(8), lg(8), now],
  );
  const handed = await insert(
    `insert into leads (prospect_id, company_name, title, summary, temperature, bant_budget, bant_authority, bant_need, bant_timeline,
                        status, lead_owner_user_id, suggested_sales_user_id, handed_off_at, created_by_user_id, updated_at)
     values (?, ?, ?, ?, 'warm', 1, 1, 1, 0, 'handed_off', ?, ?, ?, ?, ?)`,
    [prospectIds[9], prospects[9][0], 'Warehouse systems team (5 roles)', 'WMS rollout across three DCs.', lg(9), sl(0), now, lg(9), now],
  );
  await insert(
    `insert into activities (prospect_id, lead_id, type, activity_date, outcome, notes, next_follow_up, by_user_id)
     values (?, ?, 'call', ?, 'follow_up', 'Introduced the Sales lead; awaiting the role list.', ?, ?)`,
    [prospectIds[9], handed, day(-2), day(2), lg(9)],
  );

  // Q5: a lead on an existing client, when there is one.
  const { rows: someClient } = await client.execute('select id, company_name from clients order by id limit 1');
  if (someClient.length) {
    await insert(
      `insert into leads (client_id, company_name, title, temperature, bant_need, status, lead_owner_user_id, created_by_user_id, updated_at)
       values (?, ?, 'Second team for the analytics programme', 'warm', 1, 'open', ?, ?, ?)`,
      [Number(someClient[0].id), String(someClient[0].company_name), lg(0), lg(0), now],
    );
  }

  console.log(
    `Added ${campaigns.length} campaigns, ${prospects.length} prospects, ${activities.length + 1} activities and ${someClient.length ? 3 : 2} leads.` +
      (leadgen.length ? '' : '\nNo Leadgen accounts exist, so everything is unowned — only Admin and Leadgen heads will see it.'),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => client.close());
