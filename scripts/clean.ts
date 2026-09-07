/**
 * Deletes all ROWS from every table — the schema itself is left intact, so
 * no db:migrate is needed afterward. Built for the real-data cutover: wipe
 * the demo dataset, then bulk-import actual clients/projects/resources and
 * mappings via `npm run db:import`.
 *
 *   npm run db:clean                    dry run — counts rows, deletes nothing
 *   npm run db:clean -- --commit        actually deletes, after a typed confirmation
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN when set, otherwise targets the
 * local file used in development — that path skips the confirmation prompt,
 * since a local dev database is cheap to reseed.
 *
 * This is irreversible against Turso: there is no undo, no soft-delete, and
 * the free tier's point-in-time recovery window will not help if a wipe
 * wasn't the intent. Confirmation is a typed phrase, not a y/n, precisely so
 * it can't be muscle-memoried through by habit.
 */
import { createClient } from '@libsql/client';
import * as readline from 'node:readline/promises';

// `|| ''` before `.trim()` treats an env var that's set-but-blank the same
// as unset — `??` alone doesn't, and libSQL rejects '' with an opaque error.
const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const isLocal = url.startsWith('file:');

// Child tables first, so foreign keys never block a delete.
const TABLES_IN_DELETE_ORDER = [
  'opportunity_stage_history',
  'opportunity_comments',
  'opportunity_candidates',
  'opportunities',
  'candidates',
  'invoice_resources',
  'invoices',
  'agreement_resources',
  'agreements',
  'deployments',
  'projects',
  'clients',
  'resources',
];

const CONFIRM_PHRASE = 'DELETE ALL DATA';

async function main() {
  const commit = process.argv.includes('--commit');
  const client = createClient({ url, authToken });

  console.log(`Target database: ${isLocal ? url : 'Turso (remote)'}`);
  console.log(commit ? 'Mode: COMMIT — this will delete rows.\n' : 'Mode: DRY RUN\n');

  const counts: { table: string; rows: number }[] = [];
  for (const table of TABLES_IN_DELETE_ORDER) {
    const { rows } = await client.execute(`SELECT count(*) AS c FROM ${table}`);
    counts.push({ table, rows: Number(rows[0].c) });
  }

  const total = counts.reduce((s, c) => s + c.rows, 0);
  console.log('Rows per table:');
  for (const c of counts) console.log(`  ${c.table.padEnd(26)} ${c.rows}`);
  console.log(`  ${'TOTAL'.padEnd(26)} ${total}`);

  if (total === 0) {
    console.log('\nAlready empty. Nothing to do.');
    client.close();
    return;
  }

  if (!commit) {
    console.log(`\nDry run — nothing deleted. Add --commit to actually delete ${total} row(s).`);
    client.close();
    return;
  }

  // A local dev database is cheap to reseed — skip the ceremony there.
  // Anything else (Turso, or an explicit non-file URL) gets a typed
  // confirmation, because this has no undo.
  if (!isLocal) {
    console.log(
      `\nThis permanently deletes ${total} row(s) from the LIVE Turso database.\n` +
        'There is no undo.\n',
    );
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type "${CONFIRM_PHRASE}" to proceed: `);
    rl.close();
    if (answer.trim() !== CONFIRM_PHRASE) {
      console.log('\nConfirmation did not match. Nothing was deleted.');
      client.close();
      process.exit(1);
    }
  }

  // Two references make a strict child-before-parent delete order
  // impossible here: agreements.parent_agreement_id is self-referencing (the
  // renewal chain), and deployments.agreement_id points back at agreements.
  // Since every row everywhere is being removed, foreign key checks are
  // simply not useful for the duration of this operation — the alternative
  // is walking dependency order within a single self-referencing table,
  // which buys nothing when the end state is "empty" either way.
  await client.execute('PRAGMA foreign_keys = OFF');
  console.log('\nDeleting…');
  try {
    for (const table of TABLES_IN_DELETE_ORDER) {
      await client.execute(`DELETE FROM ${table}`);
      // Reset AUTOINCREMENT counters so freshly-imported data starts at id 1
      // again, matching what a human would expect after a full wipe.
      await client.execute({
        sql: 'DELETE FROM sqlite_sequence WHERE name = ?',
        args: [table],
      });
      console.log(`  cleared ${table}`);
    }
  } finally {
    await client.execute('PRAGMA foreign_keys = ON');
  }

  console.log(`\nDone — ${total} row(s) deleted. Schema is untouched; no db:migrate needed.`);
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
