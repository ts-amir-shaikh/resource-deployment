import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { reportingHandle, isDbError, type EndpointSpec, type HandlerDeps } from '@/lib/reporting/handler';
import { ResultMemo } from '@/lib/reporting/memo';
import { Throttle } from '@/lib/reporting/throttle';
import { ReportingConfigError } from '@/lib/reporting/readonly-db';
import type { AuditRecord } from '@/lib/reporting/audit';
import { tokenEnv } from './helpers/reporting';

/**
 * The handler in isolation: a stub endpoint, a fake clock, a recording audit
 * function. No database is opened.
 */

const schema = z
  .object({ limit: z.string().regex(/^\d+$/).transform(Number).default('100'), as_of: z.string().optional() })
  .strict();

function makeSpec(overrides: Partial<EndpointSpec<typeof schema, { n: number }>> = {}) {
  const run = vi.fn(async () => ({ data: { n: 1 }, notes: ['note'], rowCount: 1 }));
  const spec: EndpointSpec<typeof schema, { n: number }> = { scope: 'billing', schema, run, ...overrides };
  return { spec, run };
}

let raw = '';
let token = '';
let audits: AuditRecord[];
let nowMs: number;

function deps(over: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    env: { REPORTING_TOKENS: raw },
    now: () => nowMs,
    memo: new ResultMemo(60_000, 200, () => nowMs),
    throttle: new Throttle(30, () => nowMs),
    audit: async (rec) => {
      audits.push(rec);
      return { ok: true };
    },
    getDb: () => ({}) as never,
    ...over,
  };
}

const req = (qs = '', headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`http://localhost/api/reporting/v1/billing${qs}`, { method, headers: { authorization: `Bearer ${token}`, ...headers } });

beforeEach(async () => {
  ({ token, raw } = await tokenEnv({ id: 'h-test', scopes: ['billing'] }));
  audits = [];
  nowMs = Date.parse('2026-11-23T10:00:00Z');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('reportingHandle', () => {
  it('serves a valid request in the standard envelope with safe headers', async () => {
    const { spec } = makeSpec();
    const res = await reportingHandle(req(), spec, deps());
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const body = await res.json();
    expect(body.meta).toMatchObject({
      version: 'v1',
      scope: 'reporting:billing',
      asOf: '2026-11-23',
      timezone: 'Asia/Kolkata',
      currencyPolicy: 'per-currency, never converted',
      params: { limit: 100 },
      notes: ['note'],
    });
    expect(body.data).toEqual({ n: 1 });
  });

  it('uses the Asia/Kolkata date, not UTC', async () => {
    nowMs = Date.parse('2026-11-23T19:00:00Z'); // already the 24th in India
    const { spec, run } = makeSpec();
    const res = await reportingHandle(req(), spec, deps());
    expect((await res.json()).meta.asOf).toBe('2026-11-24');
    expect(run).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ asOf: '2026-11-24' }));
  });

  it('refuses without a token and does not run the query or audit', async () => {
    const { spec, run } = makeSpec();
    const res = await reportingHandle(new Request('http://localhost/api/reporting/v1/billing'), spec, deps());
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(audits).toHaveLength(0);
  });

  it('refuses a token that lacks the scope', async () => {
    const other = await tokenEnv({ id: 'only-invoices', scopes: ['invoices'] });
    token = other.token;
    const { spec, run } = makeSpec();
    const res = await reportingHandle(req(), spec, deps({ env: { REPORTING_TOKENS: other.raw } }));
    expect(res.status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses non-GET methods', async () => {
    const { spec, run } = makeSpec();
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await reportingHandle(req('', {}, m), spec, deps());
      expect(res.status).toBe(405);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('ignores a session cookie entirely', async () => {
    const { spec } = makeSpec();
    const noToken = await reportingHandle(
      new Request('http://localhost/api/reporting/v1/billing', { headers: { cookie: 'rd_session=anything' } }),
      spec,
      deps(),
    );
    expect(noToken.status).toBe(401);
  });

  it('rejects unknown and repeated parameters with 422 and audits them', async () => {
    const { spec, run } = makeSpec();
    const unknown = await reportingHandle(req('?surprise=1'), spec, deps());
    expect(unknown.status).toBe(422);
    expect((await unknown.json()).error.details.query).toMatch(/Unknown parameter/);
    const dup = await reportingHandle(req('?limit=1&limit=2'), spec, deps());
    expect(dup.status).toBe(422);
    expect(run).not.toHaveBeenCalled();
    expect(audits.map((a) => a.status)).toEqual([422, 422]);
  });

  it('applies spec.validate (e.g. a future as_of) as a 422', async () => {
    const { spec } = makeSpec({ validate: (p, { today }) => (p.as_of && p.as_of > today ? { as_of: 'Cannot be in the future' } : null) });
    const res = await reportingHandle(req('?as_of=2030-01-01'), spec, deps());
    expect(res.status).toBe(422);
  });

  it('rate-limits per token with Retry-After (supplementary control)', async () => {
    const { spec } = makeSpec();
    const d = deps({ throttle: new Throttle(2, () => nowMs), memo: new ResultMemo(0, 200, () => nowMs) });
    expect((await reportingHandle(req(), spec, d)).status).toBe(200);
    expect((await reportingHandle(req(), spec, d)).status).toBe(200);
    const limited = await reportingHandle(req(), spec, d);
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect(audits.at(-1)).toMatchObject({ status: 429, resultCode: 'rate_limited' });
  });

  it('writes one audit record per authenticated request, with no sensitive content', async () => {
    const { spec } = makeSpec();
    await reportingHandle(req('?limit=5'), spec, deps());
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      tokenId: 'h-test',
      endpoint: 'billing',
      status: 200,
      resultCode: 'ok',
      rowCount: 1,
      cacheHit: false,
      params: { limit: 5 },
    });
    const text = JSON.stringify(audits[0]);
    expect(text).not.toContain(token);
    expect(text).not.toMatch(/authorization|cookie|bearer/i);
  });

  describe('cache', () => {
    it('serves a repeat from the cache and says so in the audit record', async () => {
      const { spec, run } = makeSpec();
      const d = deps();
      await reportingHandle(req(), spec, d);
      const second = await reportingHandle(req(), spec, d);
      expect(second.status).toBe(200);
      expect(run).toHaveBeenCalledTimes(1);
      expect(audits.map((a) => a.cacheHit)).toEqual([false, true]);
    });

    it('treats a default and its explicit value as the same entry, and different params as different', async () => {
      const { spec, run } = makeSpec();
      const d = deps();
      await reportingHandle(req(), spec, d);
      await reportingHandle(req('?limit=100'), spec, d);
      expect(run).toHaveBeenCalledTimes(1);
      await reportingHandle(req('?limit=7'), spec, d);
      expect(run).toHaveBeenCalledTimes(2);
    });

    it('never answers from the cache before authentication and scope pass', async () => {
      const { spec, run } = makeSpec();
      const d = deps();
      expect((await reportingHandle(req(), spec, d)).status).toBe(200); // warm
      // Unknown token, same URL: 401, not the cached body.
      const bad = await reportingHandle(
        new Request('http://localhost/api/reporting/v1/billing', { headers: { authorization: `Bearer rpt_${'q'.repeat(43)}` } }),
        spec,
        d,
      );
      expect(bad.status).toBe(401);
      // Token revoked (removed from the configuration): 401 on the warm key.
      const revoked = await reportingHandle(req(), spec, { ...d, env: { REPORTING_TOKENS: '[]' } });
      expect(revoked.status).toBe(401);
      // Token without the scope: 403 on the warm key.
      const narrow = await tokenEnv({ id: 'narrow', scopes: ['invoices'], seed: 'n' });
      const forbidden = await reportingHandle(
        req('', { authorization: `Bearer ${narrow.token}` }),
        spec,
        { ...d, env: { REPORTING_TOKENS: narrow.raw } },
      );
      expect(forbidden.status).toBe(403);
      expect(run).toHaveBeenCalledTimes(1);
    });

    it('rolls over when the Asia/Kolkata date changes', async () => {
      const { spec, run } = makeSpec();
      const d = deps({ memo: new ResultMemo(24 * 3600_000, 200, () => nowMs) });
      await reportingHandle(req(), spec, d);
      nowMs = Date.parse('2026-11-23T19:00:00Z');
      await reportingHandle(req(), spec, d);
      expect(run).toHaveBeenCalledTimes(2);
    });
  });

  describe('failures', () => {
    it('maps a database fault to 503 without leaking detail', async () => {
      const boom = Object.assign(new Error('SQLITE_ERROR: no such table: secret_table'), { name: 'LibsqlError', code: 'SQLITE_ERROR' });
      const { spec } = makeSpec({ run: async () => Promise.reject(boom) });
      const res = await reportingHandle(req(), spec, deps());
      expect(res.status).toBe(503);
      expect(res.headers.get('retry-after')).toBeTruthy();
      const text = await res.text();
      expect(text).not.toContain('secret_table');
      expect(audits.at(-1)).toMatchObject({ status: 503, resultCode: 'data_unavailable' });
    });

    it('maps a missing read-only credential to 503', async () => {
      const { spec } = makeSpec({ run: async () => Promise.reject(new ReportingConfigError('x')) });
      expect((await reportingHandle(req(), spec, deps())).status).toBe(503);
      expect(isDbError(new ReportingConfigError('x'))).toBe(true);
    });

    it('maps a bug to a generic 500 and logs the detail server-side only', async () => {
      const { spec } = makeSpec({ run: async () => Promise.reject(new Error('internal detail 12345')) });
      const res = await reportingHandle(req(), spec, deps());
      expect(res.status).toBe(500);
      expect(await res.text()).not.toContain('12345');
      expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain('internal detail 12345');
    });

    it('never caches a failure', async () => {
      let calls = 0;
      const { spec } = makeSpec({
        run: async () => {
          calls++;
          if (calls === 1) throw new Error('first fails');
          return { data: { n: 2 }, notes: [], rowCount: 0 };
        },
      });
      const d = deps();
      expect((await reportingHandle(req(), spec, d)).status).toBe(500);
      expect((await reportingHandle(req(), spec, d)).status).toBe(200);
    });
  });

  describe('audit failure', () => {
    const failing = async () => ({ ok: false as const, errorClass: 'Error' });

    it('fails closed by default: 503 and the data is not served', async () => {
      const { spec } = makeSpec();
      const res = await reportingHandle(req(), spec, deps({ audit: failing }));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error.code).toBe('audit_unavailable');
      expect(body.data).toBeUndefined();
    });

    it('stays closed when only one of the two open conditions is set', async () => {
      const { spec } = makeSpec();
      const a = await reportingHandle(req(), spec, deps({ audit: failing, env: { REPORTING_TOKENS: raw, REPORTING_AUDIT_FAILURE_MODE: 'open' } }));
      const b = await reportingHandle(req(), spec, deps({ audit: failing, env: { REPORTING_TOKENS: raw, REPORTING_ALERTING_VERIFIED: 'true' } }));
      expect([a.status, b.status]).toEqual([503, 503]);
    });

    it('serves only when failure mode is open AND alerting is verified', async () => {
      const { spec } = makeSpec();
      const env = { REPORTING_TOKENS: raw, REPORTING_AUDIT_FAILURE_MODE: 'open', REPORTING_ALERTING_VERIFIED: 'true' };
      const res = await reportingHandle(req(), spec, deps({ audit: failing, env }));
      expect(res.status).toBe(200);
    });
  });
});
