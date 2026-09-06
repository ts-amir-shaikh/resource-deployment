/**
 * Applies the schema DDL. Idempotent — safe to run against a fresh Turso
 * database or an existing one.
 *
 *   npm run db:migrate
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN when set, otherwise targets the
 * local file used in development.
 */
import { createClient } from '@libsql/client';
import { DDL } from '../lib/ddl';

const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

async function main() {
  const client = createClient({ url, authToken });
  await client.executeMultiple(DDL);

  const { rows } = await client.execute(
    "select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name",
  );
  console.log(`Schema applied to ${url.startsWith('file:') ? url : 'Turso'}`);
  console.log(`Tables (${rows.length}):`);
  for (const r of rows) console.log('  ', r.name);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
