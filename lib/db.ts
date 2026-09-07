import 'server-only';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * Local development falls back to a libSQL file, so `npm run dev` needs no
 * cloud credentials. In production TURSO_DATABASE_URL points at Turso.
 *
 * `|| ''` before `.trim()` guards against an env var that's *set but blank*
 * (e.g. a `.env` with `TURSO_DATABASE_URL=""`) — `??` alone only falls back
 * for null/undefined, not empty string, and libSQL rejects '' outright with
 * an opaque URL_INVALID rather than a helpful message.
 *
 * Note the libSQL driver is async — every query is awaited, unlike the
 * synchronous better-sqlite3 driver this replaced.
 */
const url = (process.env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
const authToken = process.env.TURSO_AUTH_TOKEN;

function createDb() {
  const client = createClient({ url, authToken });
  return drizzle(client, { schema });
}

// Next.js re-evaluates modules on hot reload; cache on globalThis so dev does
// not open a new connection per reload.
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> };

export const db = globalForDb.__db ?? createDb();

if (process.env.NODE_ENV !== 'production') globalForDb.__db = db;

/** Any drizzle executor — the top-level db or a transaction handle. */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];
