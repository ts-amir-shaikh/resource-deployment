import 'server-only';
import { eq } from 'drizzle-orm';
import { ZodError, type ZodTypeAny } from 'zod';
import { db } from '@/lib/db';
import { integrationKeys, integrationLog } from '@/lib/schema';
import { bearerFrom, hashKey, scopeAllows, type KeyScope } from '@/lib/integration-rules';
import { fail, fieldErrors } from '@/lib/api';

/**
 * M62: the one door into the integration API.
 *
 * `/api/integration/*` is public to middleware (there is no cookie session to
 * check), so this wrapper is its only access control. Every route there runs
 * inside `integration()`; tests/integration-routes.test.ts fails the build if
 * one does not. It checks the bearer key and its scope, turns domain errors
 * into clean responses, and writes one log row per call.
 */

export type IntegrationCaller = { keyId: number; name: string; scope: KeyScope };

async function record(keyId: number | null, req: Request, status: number, note?: string) {
  try {
    await db
      .insert(integrationLog)
      .values({ keyId, method: req.method, path: new URL(req.url).pathname, status, note: note ?? null })
      .run();
  } catch (err) {
    // A failed log write must never turn a good answer into an error.
    console.error('[integration] log write failed', err);
  }
}

export async function integration(
  req: Request,
  needed: KeyScope,
  fn: (caller: IntegrationCaller) => Promise<Response>,
): Promise<Response> {
  const raw = bearerFrom(req.headers.get('authorization'));
  if (!raw) {
    await record(null, req, 401, 'missing key');
    return fail('A bearer API key is required.', 401);
  }

  const key = await db.select().from(integrationKeys).where(eq(integrationKeys.keyHash, hashKey(raw))).get();
  if (!key || key.revokedAt) {
    await record(key?.id ?? null, req, 401, key ? 'revoked key' : 'unknown key');
    return fail('The API key is not valid.', 401);
  }
  if (!scopeAllows(key.scope, needed)) {
    await record(key.id, req, 403, `scope ${key.scope} cannot ${needed}`);
    return fail('This key is read-only.', 403);
  }

  const caller: IntegrationCaller = { keyId: key.id, name: key.name, scope: key.scope };
  let res: Response;
  try {
    res = await fn(caller);
  } catch (err) {
    if (err instanceof ZodError) {
      res = fail('Please correct the highlighted fields', 422, { fields: fieldErrors(err) });
    } else {
      console.error('[integration]', err);
      res = fail('Something went wrong.', 500);
    }
  }
  await db
    .update(integrationKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(integrationKeys.id, key.id))
    .run()
    .catch(() => undefined);
  await record(key.id, req, res.status);
  return res;
}

/** Parses a JSON body with a Zod schema; a bad body is a 400 or 422. */
export async function readBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ data: S['_output']; error?: never } | { data?: never; error: Response }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: fail('Request body must be valid JSON', 400) };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    return { error: fail('Please correct the highlighted fields', 422, { fields: fieldErrors(result.error) }) };
  }
  return { data: result.data };
}

/** `limit` (1 to 500, default 100) and `cursor` (the last id seen) for a list. */
export function pageParams(url: URL): { limit: number; cursor: number } {
  const limit = Math.min(500, Math.max(1, Math.trunc(Number(url.searchParams.get('limit'))) || 100));
  const cursor = Math.max(0, Math.trunc(Number(url.searchParams.get('cursor'))) || 0);
  return { limit, cursor };
}

/** Takes limit + 1 rows to know whether another page exists. */
export function pageOf<T extends { id: number }>(rows: T[], limit: number): { items: T[]; nextCursor: number | null } {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}
