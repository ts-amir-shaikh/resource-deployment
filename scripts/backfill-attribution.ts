/**
 * Links historical free-text names to user accounts, where they match.
 *
 *   npm run db:backfill-attribution              dry run — reports, changes nothing
 *   npm run db:backfill-attribution -- --commit  writes the links
 *
 * Deliberately conservative: an exact, case-insensitive name match links; a
 * near-match does NOT. Two names in live data ('Rakesh Samal', 'Yogini Patil')
 * have no account at all, and guessing which colleague they meant would credit
 * one person's work to another — worse than leaving it unattributed, which the
 * dashboards report plainly as "unassigned".
 *
 * Idempotent: rows already linked are skipped, so re-running after creating an
 * account picks up that person's history without touching anything else.
 */
import { createClient } from '@libsql/client';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

async function main() {
  const commit = process.argv.includes('--commit');
  const client = createClient({ url, authToken });
  const target = url.startsWith('file:') ? 'local file' : 'Turso (remote)';

  const { rows: users } = await client.execute('select id, name from users where active = 1');
  const byName = new Map(users.map((u) => [String(u.name).trim().toLowerCase(), Number(u.id)]));

  console.log(`\nTarget: ${target}   ${commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log(`Accounts available: ${users.map((u) => u.name).join(', ')}\n`);

  const jobs: { table: string; nameCol: string; idCol: string }[] = [
    { table: 'opportunities', nameCol: 'owner', idCol: 'owner_user_id' },
    { table: 'opportunity_comments', nameCol: 'author', idCol: 'user_id' },
  ];

  const unmatched = new Map<string, number>();

  for (const job of jobs) {
    const { rows } = await client.execute(
      `select id, ${job.nameCol} as nm from ${job.table}
        where ${job.nameCol} is not null and ${job.nameCol} <> '' and ${job.idCol} is null`,
    );

    let linked = 0;
    for (const r of rows) {
      const key = String(r.nm).trim().toLowerCase();
      const uid = byName.get(key);
      if (uid === undefined) {
        unmatched.set(String(r.nm), (unmatched.get(String(r.nm)) ?? 0) + 1);
        continue;
      }
      linked++;
      if (commit) {
        await client.execute({
          sql: `update ${job.table} set ${job.idCol} = ? where id = ?`,
          args: [uid, Number(r.id)],
        });
      }
    }
    console.log(
      `  ${job.table.padEnd(22)} ${rows.length} unlinked → ${linked} matched, ${rows.length - linked} left unassigned`,
    );
  }

  if (unmatched.size) {
    console.log('\n  Names with no account — left unassigned, deliberately:');
    for (const [name, n] of unmatched) console.log(`    ${name.padEnd(20)} ${n} row(s)`);
    console.log(
      '\n  Create an account with the same name and re-run to link their history.',
    );
  }

  console.log(
    commit ? '\nDone.' : '\nDry run — nothing written. Add --commit to apply.\n',
  );
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
