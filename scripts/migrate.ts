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

const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/deployment.db';
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
