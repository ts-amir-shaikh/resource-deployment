import type { z } from 'zod';
import { istToday } from './dates';
import { logEvent } from './log';
import { ResultMemo, cacheKey } from './memo';
import { Throttle } from './throttle';
import { queryToObject, zodDetails } from './params';
import { verifyBearer } from './verify';
import type { ReportingScope } from './paths';
import { failurePolicy, writeAudit, type AuditOutcome, type AuditRecord, type Env } from './audit';
import { ReportingConfigError, getReportingDb, type ReportingDb } from './readonly-db';
import type { Envelope, ErrorBody } from './types';

/**
 * The route wrapper for every /api/reporting/v1 endpoint, and the second of
 * the two places the bearer token is verified (the first is the Edge gate).
 * It never reads a session cookie and never imports the session or account
 * modules: a browser session has no meaning here.
 *
 * Order, always:
 *   method → bearer token → scope → params (422) → throttle (429)
 *   → cache lookup → read-only query → allowlist mapper → audit → response
 *
 * The cache is consulted only after the token and scope checks, so a revoked
 * or wrong-scope token never receives a cached body.
 */

export type EndpointResult<T> = {
  data: T;
  notes: string[];
  pagination?: { limit: number; offset: number; total: number; truncated: boolean };
  /** Items returned, for the audit record. */
  rowCount: number;
};

export type EndpointContext = { db: ReportingDb; asOf: string };

export interface EndpointSpec<S extends z.ZodTypeAny, T> {
  scope: ReportingScope;
  schema: S;
  /** Checks that need today's date or several fields; returns field errors or null. */
  validate?: (params: z.output<S>, ctx: { today: string }) => Record<string, string> | null;
  run: (params: z.output<S>, ctx: EndpointContext) => Promise<EndpointResult<T>>;
}

type Cached = { result: EndpointResult<unknown>; computedAt: string };

export type HandlerDeps = {
  env: Env;
  now: () => number;
  memo: ResultMemo<Cached>;
  throttle: Throttle;
  audit: (rec: AuditRecord, env: Env) => Promise<AuditOutcome>;
  getDb: () => ReportingDb;
};

const sharedMemo = new ResultMemo<Cached>();
const sharedThrottle = new Throttle();

export function defaultDeps(): HandlerDeps {
  return {
    env: process.env,
    now: Date.now,
    memo: sharedMemo,
    throttle: sharedThrottle,
    audit: (rec, env) => writeAudit(rec, env),
    getDb: () => getReportingDb(),
  };
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(status: number, body: unknown, requestId: string, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'x-request-id': requestId, ...extra },
  });
}

function errorBody(code: string, message: string, details?: Record<string, string>): ErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

/** A database or connection fault (503), as opposed to a bug in our code (500). */
export function isDbError(err: unknown): boolean {
  if (err instanceof ReportingConfigError) return true;
  if (!(err instanceof Error)) return false;
  if (err.name === 'LibsqlError') return true;
  const code = String((err as { code?: unknown }).code ?? '');
  return /^(SQLITE|SERVER|HRANA|URL|NETWORK|ECONN|ENOTFOUND|ETIMEDOUT)/.test(code);
}

export async function reportingHandle<S extends z.ZodTypeAny, T>(
  req: Request,
  spec: EndpointSpec<S, T>,
  deps: HandlerDeps = defaultDeps(),
): Promise<Response> {
  const started = deps.now();
  const requestId = crypto.randomUUID();

  if (req.method !== 'GET') {
    return json(405, errorBody('method_not_allowed', 'Only GET is supported.'), requestId, { allow: 'GET' });
  }

  const today = istToday(new Date(started));

  // Second, independent verification. The gate may have been bypassed by a
  // routing change; nothing below runs without a valid token.
  const auth = await verifyBearer(req.headers.get('authorization'), deps.env.REPORTING_TOKENS, today);
  if (!auth.ok) {
    logEvent('warn', 'reporting_handler_auth_failed', { requestId, reason: auth.reason, endpoint: spec.scope });
    return json(401, errorBody('unauthorized', 'Missing or invalid credentials.'), requestId, {
      'www-authenticate': 'Bearer realm="reporting"',
    });
  }
  if (!auth.scopes.includes(spec.scope)) {
    logEvent('warn', 'reporting_handler_scope_denied', { requestId, tokenId: auth.tokenId, endpoint: spec.scope });
    return json(403, errorBody('insufficient_scope', 'This token does not grant access to this dataset.'), requestId);
  }

  // From here the request is authenticated and is audited whatever happens.
  let validated: Record<string, string | number | boolean> = {};
  let rowCount = 0;
  let cacheHit = false;

  const finish = async (status: number, code: string, response: Response): Promise<Response> => {
    const outcome = await deps.audit(
      {
        requestId,
        tokenId: auth.tokenId,
        endpoint: spec.scope,
        status,
        resultCode: code,
        rowCount,
        durationMs: Math.max(0, deps.now() - started),
        cacheHit,
        params: validated,
      },
      deps.env,
    );
    if (!outcome.ok && failurePolicy(deps.env) === 'closed') {
      return json(503, errorBody('audit_unavailable', 'The request could not be recorded, so it was not served.'), requestId, {
        'retry-after': '30',
      });
    }
    return response;
  };

  const url = new URL(req.url);
  const { value: raw, duplicate } = queryToObject(url.searchParams);
  if (duplicate) {
    return finish(
      422,
      'invalid_parameter',
      json(422, errorBody('invalid_parameter', 'Invalid query parameters.', { [duplicate]: 'Give each parameter once' }), requestId),
    );
  }

  const parsed = spec.schema.safeParse(raw);
  if (!parsed.success) {
    return finish(
      422,
      'invalid_parameter',
      json(422, errorBody('invalid_parameter', 'Invalid query parameters.', zodDetails(parsed.error)), requestId),
    );
  }
  const params = parsed.data as z.output<S> & Record<string, string | number | boolean | undefined>;

  const extra = spec.validate?.(params, { today });
  if (extra) {
    return finish(422, 'invalid_parameter', json(422, errorBody('invalid_parameter', 'Invalid query parameters.', extra), requestId));
  }

  validated = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined)) as Record<
    string,
    string | number | boolean
  >;
  const asOf = typeof params.as_of === 'string' ? params.as_of : today;

  const gate = deps.throttle.take(auth.tokenId);
  if (!gate.allowed) {
    return finish(
      429,
      'rate_limited',
      json(429, errorBody('rate_limited', 'Too many requests. Slow down and retry.'), requestId, {
        'retry-after': String(gate.retryAfterSeconds),
      }),
    );
  }

  const key = cacheKey({ endpoint: spec.scope, params: validated, asOf });
  let cached: Cached;
  try {
    const out = await deps.memo.getOrCompute(key, async () => ({
      result: await spec.run(params, { db: deps.getDb(), asOf }),
      computedAt: new Date(deps.now()).toISOString(),
    }));
    cached = out.value;
    cacheHit = out.hit;
  } catch (err) {
    if (isDbError(err)) {
      logEvent('error', 'reporting_data_unavailable', {
        requestId,
        tokenId: auth.tokenId,
        endpoint: spec.scope,
        errorClass: err instanceof Error ? err.name : 'unknown',
      });
      return finish(
        503,
        'data_unavailable',
        json(503, errorBody('data_unavailable', 'The data source is temporarily unavailable.'), requestId, { 'retry-after': '30' }),
      );
    }
    // A bug, not an outage. The detail goes to the server log, never the caller.
    console.error(
      JSON.stringify({ event: 'reporting_internal_error', requestId, endpoint: spec.scope, message: err instanceof Error ? err.message : String(err) }),
    );
    return finish(500, 'internal_error', json(500, errorBody('internal_error', 'Something went wrong.'), requestId));
  }

  rowCount = cached.result.rowCount;
  const envelope: Envelope<unknown> = {
    meta: {
      version: 'v1',
      generatedAt: cached.computedAt,
      asOf,
      timezone: 'Asia/Kolkata',
      scope: `reporting:${spec.scope}`,
      currencyPolicy: 'per-currency, never converted',
      params: validated,
      ...(cached.result.pagination ? { pagination: cached.result.pagination } : {}),
      notes: cached.result.notes,
    },
    data: cached.result.data,
  };
  return finish(200, 'ok', json(200, envelope, requestId));
}
