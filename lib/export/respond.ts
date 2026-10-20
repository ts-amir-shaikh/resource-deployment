import 'server-only';
import { db } from '@/lib/db';
import { exportEvents } from '@/lib/schema';
import { fail } from '@/lib/api';
import { today } from '@/lib/utils';
import type { Session } from '@/lib/auth';
import type { ListDef } from '@/lib/lists/types';
import { csvFilename, toCsv } from './csv';

/** About 12 KB of URL — well inside what Caddy and Next accept. */
export const MAX_TICKED_IDS = 2000;

/** Query params that steer the export rather than filter the list. */
const CONTROL_PARAMS = ['fields', 'mode', 'ids'];

/**
 * The shared body of every `/api/<module>/export` route.
 *
 * The route has already passed middleware (back-office role) and `handle()`
 * (account still current), and has loaded the rows this viewer may see. This
 * checks the request against the list's own allowlist, cuts the rows down to
 * the filtered or ticked set, logs the export and returns the file.
 */
export async function exportResponse<Row extends { id: number }, Filters>(opts: {
  req: Request;
  actor: Pick<Session, 'uid' | 'name'>;
  def: ListDef<Row, Filters>;
  rows: Row[];
}): Promise<Response> {
  const { req, actor, def } = opts;
  const params = new URL(req.url).searchParams;

  const requested = (params.get('fields') ?? '').split(',').map((f) => f.trim()).filter(Boolean);
  if (!requested.length) return fail('Choose at least one field to export', 422);
  const byKey = new Map(def.columns.map((c) => [c.key, c]));
  const unknown = requested.filter((f) => !byKey.has(f));
  if (unknown.length) return fail(`Unknown field: ${unknown.join(', ')}`, 422);
  // File order follows the list's own order, whatever order the request used.
  const wanted = new Set(requested);
  const columns = def.columns.filter((c) => wanted.has(c.key));

  const mode = params.get('mode') === 'ticked' ? 'ticked' : 'filtered';
  let rows: Row[];
  let filters: Record<string, string> = {};

  if (mode === 'ticked') {
    const raw = (params.get('ids') ?? '').split(',').filter(Boolean);
    if (!raw.length) return fail('Tick at least one row to export', 422);
    if (raw.length > MAX_TICKED_IDS) {
      return fail(`Too many ticked rows — at most ${MAX_TICKED_IDS} at a time`, 422);
    }
    const ids = new Set(raw.map(Number));
    if ([...ids].some((n) => !Number.isInteger(n) || n <= 0)) return fail('Invalid row selection', 422);
    // Intersected with the loaded rows, so a hand-written id list reaches
    // nothing the viewer could not already see.
    rows = opts.rows.filter((r) => ids.has(r.id));
  } else {
    const parsed = def.fromParams(params);
    rows = def.filterRows(opts.rows, parsed);
    filters = def.toParams(parsed);
    for (const k of CONTROL_PARAMS) delete filters[k];
  }

  await db
    .insert(exportEvents)
    .values({
      actorUserId: actor.uid || null,
      actorName: actor.name,
      list: def.list,
      mode,
      fields: JSON.stringify(columns.map((c) => c.key)),
      filters: JSON.stringify(filters),
      rowCount: rows.length,
    })
    .run();

  return new Response(toCsv(columns, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(def.list, today())}"`,
      'Cache-Control': 'no-store',
    },
  });
}
