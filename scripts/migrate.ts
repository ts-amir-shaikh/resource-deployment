/**
 * Applies the schema DDL, then any incremental column migrations that a
 * table created before that column existed still needs. Idempotent — safe
 * to run against a fresh Turso database, an existing one, or repeatedly.
 *
 *   npm run db:migrate
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN when set, otherwise targets the
 * local file used in development.
 *
 * `CREATE TABLE IF NOT EXISTS` in ddl.ts only helps a table that doesn't
 * exist yet — it does nothing for a table that already exists without a
 * newly-added column (cleaning data with scripts/clean.ts empties tables, it
 * does not drop them). Each entry below adds one such column when missing.
 */
import { createClient, type Client } from '@libsql/client';
import { DDL } from '../lib/ddl';

// `|| ''` before `.trim()` treats an env var that's set-but-blank the same
// as unset — `??` alone doesn't, and libSQL rejects '' with an opaque error.
const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

type ColumnMigration = {
  table: string;
  column: string;
  ddl: string;
};

const COLUMN_MIGRATIONS: ColumnMigration[] = [
  {
    table: 'deployments',
    column: 'agreement_id',
    ddl: 'ALTER TABLE deployments ADD COLUMN agreement_id INTEGER REFERENCES agreements(id)',
  },
  {
    table: 'opportunities',
    column: 'hiring_budget_min',
    ddl: 'ALTER TABLE opportunities ADD COLUMN hiring_budget_min REAL',
  },
  {
    table: 'opportunities',
    column: 'hiring_budget_max',
    ddl: 'ALTER TABLE opportunities ADD COLUMN hiring_budget_max REAL',
  },
  // Phase 4 — multi-currency. Existing rows are all rupee-denominated, so the
  // default backfills them correctly and no data migration is needed.
  {
    table: 'deployments',
    column: 'currency',
    ddl: "ALTER TABLE deployments ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'",
  },
  {
    table: 'agreements',
    column: 'currency',
    ddl: "ALTER TABLE agreements ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'",
  },
  {
    table: 'invoices',
    column: 'currency',
    ddl: "ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'",
  },
  {
    table: 'invoices',
    column: 'fx_rate_to_inr',
    ddl: 'ALTER TABLE invoices ADD COLUMN fx_rate_to_inr REAL NOT NULL DEFAULT 1',
  },
  // Phase 5 — public job board. is_listed defaults to 0, so applying this
  // migration publishes nothing: every existing requirement stays private
  // until somebody lists it deliberately.
  {
    table: 'opportunities',
    column: 'is_listed',
    ddl: 'ALTER TABLE opportunities ADD COLUMN is_listed INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: 'opportunities',
    column: 'listed_at',
    ddl: 'ALTER TABLE opportunities ADD COLUMN listed_at TEXT',
  },
  {
    table: 'opportunities',
    column: 'public_title',
    ddl: 'ALTER TABLE opportunities ADD COLUMN public_title TEXT',
  },
  {
    table: 'opportunities',
    column: 'public_company_label',
    ddl: 'ALTER TABLE opportunities ADD COLUMN public_company_label TEXT',
  },
  {
    table: 'opportunities',
    column: 'show_client_name',
    ddl: 'ALTER TABLE opportunities ADD COLUMN show_client_name INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: 'referrals',
    column: 'kind',
    ddl: "ALTER TABLE referrals ADD COLUMN kind TEXT NOT NULL DEFAULT 'referral'",
  },
  // Phase 6 — pipeline value.
  {
    table: 'opportunities',
    column: 'currency',
    ddl: "ALTER TABLE opportunities ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR'",
  },
  {
    table: 'opportunities',
    column: 'deal_value',
    ddl: 'ALTER TABLE opportunities ADD COLUMN deal_value REAL',
  },
  // Phase 8 — attribution, ratings and the referrer link. Every one is
  // nullable: rows written before this simply have no actor, which the
  // dashboards report as "unassigned" rather than guessing at.
  {
    table: 'users',
    column: 'is_team_lead',
    ddl: 'ALTER TABLE users ADD COLUMN is_team_lead INTEGER NOT NULL DEFAULT 0',
  },
  {
    table: 'opportunities',
    column: 'owner_user_id',
    ddl: 'ALTER TABLE opportunities ADD COLUMN owner_user_id INTEGER',
  },
  {
    table: 'opportunity_comments',
    column: 'user_id',
    ddl: 'ALTER TABLE opportunity_comments ADD COLUMN user_id INTEGER',
  },
  {
    table: 'opportunity_stage_history',
    column: 'user_id',
    ddl: 'ALTER TABLE opportunity_stage_history ADD COLUMN user_id INTEGER',
  },
  {
    table: 'opportunity_candidates',
    column: 'user_id',
    ddl: 'ALTER TABLE opportunity_candidates ADD COLUMN user_id INTEGER',
  },
  {
    table: 'opportunity_candidates',
    column: 'updated_by_user_id',
    ddl: 'ALTER TABLE opportunity_candidates ADD COLUMN updated_by_user_id INTEGER',
  },
  {
    table: 'referrals',
    column: 'decided_by_user_id',
    ddl: 'ALTER TABLE referrals ADD COLUMN decided_by_user_id INTEGER',
  },
  {
    table: 'referrals',
    column: 'referred_by_resource_id',
    ddl: 'ALTER TABLE referrals ADD COLUMN referred_by_resource_id INTEGER REFERENCES resources(id)',
  },
  // Phase 9 — the applicant loop. The triage columns default to a value that
  // means "nothing has happened yet", so every application already sitting in
  // the inbox reads correctly as un-called rather than as un-migrated.
  {
    table: 'referrals',
    column: 'contact_status',
    ddl: "ALTER TABLE referrals ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'not_contacted'",
  },
  {
    table: 'referrals',
    column: 'contact_note',
    ddl: 'ALTER TABLE referrals ADD COLUMN contact_note TEXT',
  },
  {
    table: 'referrals',
    column: 'last_contacted_at',
    ddl: 'ALTER TABLE referrals ADD COLUMN last_contacted_at TEXT',
  },
  {
    table: 'referrals',
    column: 'contacted_by_user_id',
    ddl: 'ALTER TABLE referrals ADD COLUMN contacted_by_user_id INTEGER',
  },
  // Null means "has never opened the queue", which is what everyone's state
  // genuinely is the moment this ships — so every existing application counts
  // as new to them, which is the correct answer rather than a convenient one.
  {
    table: 'users',
    column: 'applications_seen_at',
    ddl: 'ALTER TABLE users ADD COLUMN applications_seen_at TEXT',
  },
  // Nullable: scores recorded before rounds existed stay profile-level.
  // Null means "never recorded a JD change", which is true of every existing
  // row — so a question set generated against one is not wrongly called stale.
  {
    table: 'opportunities',
    column: 'jd_updated_at',
    ddl: 'ALTER TABLE opportunities ADD COLUMN jd_updated_at TEXT',
  },
  {
    table: 'candidate_ratings',
    column: 'interview_id',
    // No REFERENCES clause: column migrations run before the base DDL, so
    // candidate_interviews may not exist yet on an established database.
    // Every other retro-added link column here is a bare INTEGER for the
    // same reason; the constraint is present in ddl.ts for fresh databases.
    ddl: 'ALTER TABLE candidate_ratings ADD COLUMN interview_id INTEGER',
  },
];

async function tableExists(client: Client, table: string) {
  const { rows } = await client.execute({
    sql: "select 1 from sqlite_master where type='table' and name = ?",
    args: [table],
  });
  return rows.length > 0;
}

async function hasColumn(client: Client, table: string, column: string) {
  const { rows } = await client.execute(`PRAGMA table_info(${table})`);
  return rows.some((r) => String(r.name) === column);
}

async function main() {
  const client = createClient({ url, authToken });

  // Column migrations run BEFORE the base DDL: ddl.ts's CREATE INDEX
  // statements reference these columns, so an existing table (from before
  // the column existed) must be patched first or the index creation fails
  // against it. A table that doesn't exist yet is skipped here — the DDL's
  // CREATE TABLE below already includes the column from the start.
  for (const m of COLUMN_MIGRATIONS) {
    if (!(await tableExists(client, m.table))) continue;
    if (await hasColumn(client, m.table, m.column)) {
      console.log(`  already has ${m.table}.${m.column}`);
      continue;
    }
    await client.execute(m.ddl);
    console.log(`  added ${m.table}.${m.column}`);
  }

  await client.executeMultiple(DDL);

  // Reference data, not user data: the generic rating pointers every position
  // is scored against. Seeded only when the table is empty, so it arrives with
  // the feature instead of needing a separate manual step — and re-running
  // never duplicates or resurrects a pointer someone deactivated.
  const { rows: critCount } = await client.execute('select count(*) c from rating_criteria');
  if (Number(critCount[0].c) === 0) {
    const defaults: [string, string][] = [
      ['Technical skill match', 'Depth against the mandatory skills on the JD'],
      ['Relevant experience', 'Has done this kind of work, at this kind of scale'],
      ['Communication', 'Clarity in the screening call; client-facing readiness'],
      ['Stability', 'Tenure pattern and reasons for moving'],
      ['Notice period fit', 'Availability against when the client needs someone'],
      ['Compensation fit', 'Expectation against the hiring budget'],
    ];
    for (let i = 0; i < defaults.length; i++) {
      await client.execute({
        sql: `insert into rating_criteria (label, description, scope, sort_order, active)
              values (?, ?, 'global', ?, 1)`,
        args: [defaults[i][0], defaults[i][1], i],
      });
    }
    console.log(`  seeded ${defaults.length} global rating pointers`);
  }

  // Phase 9 — lift each mapping's single feedback field into a round-1 row.
  //
  // Those three columns keep being written with the latest round, so this is a
  // copy rather than a move: nothing that reads them today changes. Guarded on
  // the mapping having no interview rows yet, so re-running never duplicates
  // and never resurrects a round somebody deleted.
  const { rows: lifted } = await client.execute(`
    insert into candidate_interviews
      (opportunity_candidate_id, round, mode, scheduled_at, held_at, outcome,
       feedback, logged_by_user_id, created_at)
    select oc.id,
           case when oc.interview_round > 0 then oc.interview_round else 1 end,
           'internal_screening',
           oc.interview_date,
           oc.interview_date,
           case
             when oc.status in ('selected', 'offered', 'joined') then 'pass'
             when oc.status = 'rejected' then 'fail'
             else null
           end,
           oc.feedback,
           oc.updated_by_user_id,
           oc.created_at
      from opportunity_candidates oc
     where (oc.feedback is not null or oc.interview_round > 0 or oc.interview_date is not null)
       and not exists (
         select 1 from candidate_interviews ci
          where ci.opportunity_candidate_id = oc.id
       )
    returning id
  `);
  if (lifted.length > 0) {
    console.log(`  lifted ${lifted.length} existing feedback record(s) into round 1`);
  }

  const { rows } = await client.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name",
  );
  console.log(`\nSchema applied to ${url.startsWith('file:') ? url : 'Turso'}`);
  console.log(`Tables (${rows.length}):`);
  for (const r of rows) console.log('  ', r.name);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
