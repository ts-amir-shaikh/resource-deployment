/**
 * Issues an integration API key (M62). Prints the key once; only its hash is
 * stored, so a lost key is replaced, not recovered.
 *
 *   npm run db:integration-key -- "Tally data app" read-write
 *
 * Targets TURSO_DATABASE_URL, or the local file when unset. Never run it
 * against production yourself: the Product Owner issues production keys.
 */
import { createClient } from '@libsql/client';
import { generateKey, hashKey } from '../lib/integration-rules';

const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const name = process.argv[2];
const scope = process.argv[3] ?? 'read';

async function main() {
  if (!name || (scope !== 'read' && scope !== 'read-write')) {
    console.error('Usage: npm run db:integration-key -- "<name>" [read|read-write]');
    process.exit(1);
  }
  const key = generateKey();
  const client = createClient({ url, authToken });
  await client.execute({
    sql: 'INSERT INTO integration_keys (name, key_hash, scope) VALUES (?, ?, ?)',
    args: [name, hashKey(key), scope],
  });
  console.log(`Key for "${name}" (${scope}) on ${url}:\n\n  ${key}\n\nShown once. Store it now.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
