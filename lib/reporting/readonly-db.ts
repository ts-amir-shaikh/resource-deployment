import { createClient } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from '@/lib/schema';

/**
 * The database handle every reporting query uses. It is NOT the application's
 * global client (lib/db.ts, which can write): on Turso it authenticates with a
 * read-only token, so a coding mistake in reporting code still cannot change a
 * business table.
 *
 * Local development uses a file database, which has no token concept; there
 * the guarantee rests on the static scan and the row-count integration tests.
 *
 * Remote database without TURSO_READONLY_AUTH_TOKEN → refuse (the handler turns
 * this into 503 data_unavailable) rather than quietly use the writable token.
 * The one escape hatch, REPORTING_ALLOW_WRITABLE_DB=true, exists for approved
 * non-production test databases only and logs a warning.
 */

export type ReportingDb = LibSQLDatabase<typeof schema>;

export class ReportingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportingConfigError';
  }
}

let cached: { key: string; db: ReportingDb } | undefined;

export function getReportingDb(env: Record<string, string | undefined> = process.env): ReportingDb {
  const url = (env.TURSO_DATABASE_URL || '').trim() || 'file:./data/deployment.db';
  const isFile = url.startsWith('file:');
  let authToken: string | undefined;

  if (!isFile) {
    authToken = env.TURSO_READONLY_AUTH_TOKEN || undefined;
    if (!authToken) {
      if (env.REPORTING_ALLOW_WRITABLE_DB === 'true' && env.TURSO_AUTH_TOKEN) {
        console.warn(
          JSON.stringify({ event: 'reporting_writable_db_allowed', note: 'TURSO_READONLY_AUTH_TOKEN is not set' }),
        );
        authToken = env.TURSO_AUTH_TOKEN;
      } else {
        throw new ReportingConfigError('TURSO_READONLY_AUTH_TOKEN is not set for the remote database');
      }
    }
  }

  const key = `${url}|${authToken ? 'token' : 'none'}`;
  if (cached && cached.key === key) return cached.db;
  const db = drizzle(createClient({ url, authToken }), { schema });
  cached = { key, db };
  return db;
}

/** Test hook: forget the cached client (e.g. after pointing at a new scratch database). */
export function resetReportingDbForTests(): void {
  cached = undefined;
}
