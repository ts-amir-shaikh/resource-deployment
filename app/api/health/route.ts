import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness + readiness in one unauthenticated call, used by the deploy script,
 * the reverse proxy and anyone checking what is actually running.
 *
 * "commit" is stamped into the image at build time (APP_COMMIT) so a deploy can
 * be verified with one curl instead of grepping bundles; Vercel exposes its own
 * variable for the same thing. "db" proves the server can reach the database,
 * not merely that the process is up — a 503 here means the app would fail on
 * its first real request too.
 *
 * Deliberately reveals nothing else: no versions, no counts, no hostnames.
 */
const commit =
  process.env.APP_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';

export async function GET() {
  try {
    await db.run(sql`select 1`);
    return NextResponse.json(
      { ok: true, commit, db: 'ok' },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, commit, db: `error: ${message}` },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
