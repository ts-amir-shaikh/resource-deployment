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
