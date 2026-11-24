import { describe, expect, it, vi } from 'vitest';
import {
  MAX_LIMIT,
  billingParams,
  capacityParams,
  invoicesParams,
  pipelineParams,
  queryToObject,
  renewalsParams,
  zodDetails,
} from './params';
import { MEMO_MAX_ENTRIES, ResultMemo, cacheKey } from './memo';
import { Throttle } from './throttle';
import { AUDIT_TIMEOUT_MS, auditMode, auditRow, failurePolicy, writeAudit, type AuditRecord } from './audit';
import { logEvent } from './log';

const q = (s: string) => Object.fromEntries(new URLSearchParams(s));

describe('query parameters', () => {
  it('applies defaults', () => {
    expect(billingParams.parse({})).toEqual({ limit: 100, offset: 0 });
    expect(capacityParams.parse({})).toEqual({ min_free: 1, limit: 100, offset: 0 });
    expect(pipelineParams.parse({})).toEqual({ include_terminal: false, limit: 100, offset: 0 });
    expect(renewalsParams.parse({})).toEqual({ window_days: 90, lapsed_within_days: 90, limit: 100, offset: 0 });
  });

  it('rejects unknown keys instead of ignoring them', () => {
    const r = billingParams.safeParse(q('curency=INR'));
    expect(r.success).toBe(false);
    if (!r.success) expect(zodDetails(r.error).query).toMatch(/Unknown parameter/);
  });

  it.each([
    ['limit=0'],
    [`limit=${MAX_LIMIT + 1}`],
    ['limit='],
    ['limit=abc'],
    ['limit=-1'],
    ['limit=1.5'],
    ['offset=-1'],
    ['currency=EUR'],
    ['currency=inr'],
    ['client_id=0'],
    ['client_id='],
  ])('rejects %s', (qs) => {
    expect(billingParams.safeParse(q(qs)).success).toBe(false);
  });

  it('does not turn an empty value into zero', () => {
    expect(billingParams.safeParse({ offset: '' }).success).toBe(false);
    expect(capacityParams.safeParse({ min_free: '' }).success).toBe(false);
  });

  it('validates invoice dates and the 24-month window', () => {
    expect(invoicesParams.safeParse(q('from=2026-01-01&to=2026-12-31')).success).toBe(true);
    expect(invoicesParams.safeParse(q('from=2026-02-30')).success).toBe(false);
    expect(invoicesParams.safeParse(q('as_of=2026/11/23')).success).toBe(false);
    expect(invoicesParams.safeParse(q('from=2026-06-01&to=2026-01-01')).success).toBe(false);
    expect(invoicesParams.safeParse(q('from=2020-01-01&to=2026-01-01')).success).toBe(false);
    expect(invoicesParams.safeParse(q('from=2024-11-23&to=2026-11-23')).success).toBe(true);
  });

  it('bounds the capacity, renewal and pipeline parameters', () => {
    expect(capacityParams.safeParse({ min_free: '101' }).success).toBe(false);
    expect(renewalsParams.safeParse({ window_days: '0' }).success).toBe(false);
    expect(renewalsParams.safeParse({ window_days: '366' }).success).toBe(false);
    expect(renewalsParams.safeParse({ window_days: '365', lapsed_within_days: '0' }).success).toBe(true);
    expect(pipelineParams.safeParse({ stage: 'nonsense' }).success).toBe(false);
    expect(pipelineParams.safeParse({ stage: 'open', include_terminal: 'true' }).success).toBe(true);
    expect(pipelineParams.safeParse({ include_terminal: 'yes' }).success).toBe(false);
  });

  it('flags a repeated key', () => {
    expect(queryToObject(new URLSearchParams('limit=1&limit=2')).duplicate).toBe('limit');
    expect(queryToObject(new URLSearchParams('limit=1&offset=2')).duplicate).toBeUndefined();
  });
});

describe('result memo', () => {
  it('builds the key from the endpoint, every validated parameter and the as-of date', () => {
    const base = { endpoint: 'billing', params: { limit: 100, offset: 0 }, asOf: '2026-11-23' };
    const k = cacheKey(base);
    expect(cacheKey({ ...base, endpoint: 'invoices' })).not.toBe(k);
    expect(cacheKey({ ...base, asOf: '2026-11-24' })).not.toBe(k);
    expect(cacheKey({ ...base, params: { limit: 100, offset: 0, currency: 'INR' } })).not.toBe(k);
    expect(cacheKey({ ...base, params: { limit: 100, offset: 100 } })).not.toBe(k);
    expect(cacheKey({ ...base, params: { offset: 0, limit: 100 } })).toBe(k); // order-insensitive
    expect(cacheKey({ ...base, params: { limit: 100, offset: 0, currency: undefined } })).toBe(k);
  });

  it('keys every parameter each endpoint accepts', () => {
    // Guard: if a schema grows a parameter, the key must reflect it. Every
    // parsed field is passed to cacheKey by the handler, so two parses that
    // differ in any field must produce different keys.
    const a = cacheKey({ endpoint: 'renewals', asOf: 'x', params: renewalsParams.parse({}) });
    for (const qs of ['window_days=30', 'lapsed_within_days=10', 'client_id=2', 'limit=5', 'offset=1']) {
      expect(cacheKey({ endpoint: 'renewals', asOf: 'x', params: renewalsParams.parse(q(qs)) })).not.toBe(a);
    }
    const p = cacheKey({ endpoint: 'pipeline', asOf: 'x', params: pipelineParams.parse({}) });
    for (const qs of ['stage=won', 'client_id=2', 'include_terminal=true']) {
      expect(cacheKey({ endpoint: 'pipeline', asOf: 'x', params: pipelineParams.parse(q(qs)) })).not.toBe(p);
    }
  });

  it('expires entries and counts hits', async () => {
    let t = 0;
    const memo = new ResultMemo<number>(1000, 10, () => t);
    let calls = 0;
    const compute = async () => ++calls;
    expect(await memo.getOrCompute('k', compute)).toEqual({ value: 1, hit: false });
    expect(await memo.getOrCompute('k', compute)).toEqual({ value: 1, hit: true });
    t = 1001;
    expect(await memo.getOrCompute('k', compute)).toEqual({ value: 2, hit: false });
  });

  it('computes once for concurrent identical requests and never caches a failure', async () => {
    const memo = new ResultMemo<number>();
    let calls = 0;
    const slow = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 7;
    };
    const [a, b] = await Promise.all([memo.getOrCompute('k', slow), memo.getOrCompute('k', slow)]);
    expect(calls).toBe(1);
    expect([a.value, b.value]).toEqual([7, 7]);

    await expect(memo.getOrCompute('bad', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(memo.peek('bad')).toBeUndefined();
  });

  it('is bounded', async () => {
    const memo = new ResultMemo<number>(60_000, 3);
    for (let i = 0; i < 10; i++) await memo.getOrCompute(`k${i}`, async () => i);
    expect(memo.size).toBeLessThanOrEqual(3);
    expect(MEMO_MAX_ENTRIES).toBe(200);
  });
});

describe('throttle (supplementary only)', () => {
  it('allows a burst up to the limit, then refuses with a retry time, then recovers', () => {
    let t = 0;
    const th = new Throttle(3, () => t);
    expect(th.take('a').allowed).toBe(true);
    expect(th.take('a').allowed).toBe(true);
    expect(th.take('a').allowed).toBe(true);
    const r = th.take('a');
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(th.take('other').allowed).toBe(true); // buckets are per token id
    t = 60_000;
    expect(th.take('a').allowed).toBe(true);
  });
});

describe('audit', () => {
  const rec: AuditRecord = {
    requestId: 'r1',
    tokenId: 'gpt-sales',
    endpoint: 'billing',
    status: 200,
    resultCode: 'ok',
    rowCount: 3,
    durationMs: 12,
    cacheHit: false,
    params: { limit: 100 },
  };

  it('writes only the allowlisted columns', () => {
    expect(Object.keys(auditRow(rec)).sort()).toEqual(
      ['cacheHit', 'durationMs', 'endpoint', 'paramsJson', 'requestId', 'resultCode', 'rowCount', 'status', 'tokenId'].sort(),
    );
  });

  it('fails closed unless failure mode is open AND alerting is verified', () => {
    expect(failurePolicy({})).toBe('closed');
    expect(failurePolicy({ REPORTING_AUDIT_FAILURE_MODE: 'open' })).toBe('closed');
    expect(failurePolicy({ REPORTING_ALERTING_VERIFIED: 'true' })).toBe('closed');
    expect(failurePolicy({ REPORTING_AUDIT_FAILURE_MODE: 'open', REPORTING_ALERTING_VERIFIED: 'false' })).toBe('closed');
    expect(failurePolicy({ REPORTING_AUDIT_FAILURE_MODE: 'open', REPORTING_ALERTING_VERIFIED: 'true' })).toBe('open');
    expect(auditMode({})).toBe('table');
    expect(auditMode({ REPORTING_AUDIT: 'log' })).toBe('log');
  });

  it('logs a failure and a fallback record, with no token material', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await writeAudit(rec, {}, async () => {
      throw new Error('db down');
    });
    expect(out.ok).toBe(false);
    const errLine = String(err.mock.calls[0][0]);
    expect(errLine).toContain('reporting_audit_write_failed');
    expect(errLine).toContain('gpt-sales');
    expect(String(log.mock.calls[0][0])).toContain('reporting_audit_fallback');
    err.mockRestore();
    log.mockRestore();
  });

  it('treats a slow insert as a failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = await writeAudit(rec, {}, () => new Promise(() => {}), 20);
    expect(out).toEqual({ ok: false, errorClass: 'timeout' });
    expect(AUDIT_TIMEOUT_MS).toBe(1500);
    err.mockRestore();
    log.mockRestore();
  });

  it('log mode writes a line instead of a row', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const insert = vi.fn();
    const out = await writeAudit(rec, { REPORTING_AUDIT: 'log' }, insert);
    expect(out.ok).toBe(true);
    expect(insert).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toContain('reporting_audit');
    log.mockRestore();
  });

  it('logEvent drops secret-looking fields as a backstop', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    logEvent('info', 'x', { tokenId: 'ok', authorization: 'Bearer abc', cookie: 'c', token: 't', sha256: 'h', password: 'p' });
    const line = JSON.parse(String(log.mock.calls[0][0]));
    expect(line.tokenId).toBe('ok');
    expect(Object.keys(line)).not.toContain('authorization');
    expect(Object.keys(line)).not.toContain('cookie');
    expect(Object.keys(line)).not.toContain('token');
    expect(Object.keys(line)).not.toContain('sha256');
    expect(Object.keys(line)).not.toContain('password');
    log.mockRestore();
  });
});
