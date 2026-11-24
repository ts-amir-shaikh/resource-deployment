import { describe, expect, it } from 'vitest';
import { REPORTING_SCOPES, SCOPE_PATHS, isReportingPath, scopeForPath } from './paths';
import { addDaysIso, daysBetweenIso, isRealIsoDate, istToday } from './dates';
import { TOKEN_PATTERN, constantTimeEqual, parseTokenConfig, sha256Hex, verifyBearer } from './verify';
import { addTo, round2, sumMoney, toMoney, type Currency } from './money';

import { makeToken } from '../../tests/helpers/reporting';

describe('reporting paths', () => {
  it('knows the five dataset paths', () => {
    expect(REPORTING_SCOPES).toEqual(['billing', 'invoices', 'capacity', 'pipeline', 'renewals']);
    for (const scope of REPORTING_SCOPES) {
      expect(scopeForPath(SCOPE_PATHS[scope])).toBe(scope);
      expect(isReportingPath(SCOPE_PATHS[scope])).toBe(true);
    }
  });

  it.each([
    '/api/reporting',
    '/api/reporting/',
    '/api/reporting/v1/billing/',
    '/api/reporting/v2/billing',
    '/api/REPORTING/v1/billing',
    '/API/reporting/v1/billing',
    '//api/reporting/v1/billing',
    '/api//reporting/v1/billing',
    '/api/%72eporting/v1/billing',
    '/api/reporting/%2e%2e/invoices',
    '/api/x/..%2freporting/v1/billing',
    '/api/reporting/v1/unknown',
    '/api/%zz',
  ])('treats %s as a reporting path so it is refused, never routed to the session policy', (p) => {
    expect(isReportingPath(p)).toBe(true);
  });

  it.each(['/', '/login', '/invoices', '/api/invoices', '/api/dashboard/summary', '/api/auth/login', '/jobs/abc', '/reports'])(
    'leaves %s to the session policy',
    (p) => {
      expect(isReportingPath(p)).toBe(false);
    },
  );

  it('resolves a scope only for the exact path (trailing slash tolerated)', () => {
    expect(scopeForPath('/api/reporting/v1/billing/')).toBe('billing');
    expect(scopeForPath('/api/REPORTING/v1/Invoices')).toBe('invoices');
    expect(scopeForPath('/api/reporting/v1/billing/extra')).toBeNull();
    expect(scopeForPath('/api/reporting/v1')).toBeNull();
    expect(scopeForPath('/api/reporting/v1/%zz')).toBeNull();
  });
});

describe('Asia/Kolkata dates', () => {
  it('rolls the date at 18:30 UTC, not at UTC midnight', () => {
    expect(istToday(new Date('2026-11-23T18:29:59Z'))).toBe('2026-11-23');
    expect(istToday(new Date('2026-11-23T18:30:00Z'))).toBe('2026-11-24');
    expect(istToday(new Date('2026-11-23T23:59:00Z'))).toBe('2026-11-24');
    expect(istToday(new Date('2026-12-31T20:00:00Z'))).toBe('2027-01-01');
  });

  it('validates real calendar dates only', () => {
    expect(isRealIsoDate('2026-02-28')).toBe(true);
    expect(isRealIsoDate('2028-02-29')).toBe(true);
    expect(isRealIsoDate('2026-02-29')).toBe(false);
    expect(isRealIsoDate('2026-13-01')).toBe(false);
    expect(isRealIsoDate('2026-1-1')).toBe(false);
    expect(isRealIsoDate('')).toBe(false);
  });

  it('does date arithmetic on date-only strings', () => {
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysIso('2026-11-23', 90)).toBe('2027-02-21');
    expect(daysBetweenIso('2026-11-23', '2026-11-24')).toBe(1);
    expect(daysBetweenIso('2026-11-24', '2026-11-23')).toBe(-1);
    expect(daysBetweenIso('2026-01-01', '2027-01-01')).toBe(365);
  });
});

describe('money helpers keep currencies apart', () => {
  it('sums within a currency and orders INR, AED, USD', () => {
    const rows: { currency: Currency; amount: number }[] = [
      { currency: 'USD', amount: 10 },
      { currency: 'INR', amount: 100.005 },
      { currency: 'INR', amount: 50 },
      { currency: 'AED', amount: 7 },
    ];
    expect(sumMoney(rows)).toEqual([
      { currency: 'INR', amount: 150.01 },
      { currency: 'AED', amount: 7 },
      { currency: 'USD', amount: 10 },
    ]);
  });

  it('never produces a combined figure', () => {
    const m = new Map<Currency, number>();
    addTo(m, 'INR', 1);
    addTo(m, 'USD', 1);
    expect(toMoney(m)).toHaveLength(2);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('token configuration', () => {
  it('rejects a missing or malformed configuration, so nothing authenticates', async () => {
    expect(parseTokenConfig(undefined).ok).toBe(false);
    expect(parseTokenConfig('').ok).toBe(false);
    expect(parseTokenConfig('not json').ok).toBe(false);
    expect(parseTokenConfig('{}').ok).toBe(false);
    const { sha256 } = await makeToken();
    const entry = { id: 'gpt', sha256, scopes: ['billing'], expires: '2027-01-01' };
    expect(parseTokenConfig(JSON.stringify([entry])).ok).toBe(true);
    expect(parseTokenConfig(JSON.stringify([{ ...entry, scopes: [] }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([{ ...entry, scopes: ['everything'] }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([{ ...entry, scopes: ['*'] }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([{ ...entry, expires: undefined }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([{ ...entry, expires: '2027-02-30' }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([{ ...entry, sha256: 'ABC' }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([entry, { ...entry }])).ok).toBe(false);
    expect(parseTokenConfig(JSON.stringify([entry, { ...entry, id: 'other' }])).ok).toBe(false);
  });

  it('does not store plaintext: the config holds only a 64-character hash', async () => {
    const { token, sha256 } = await makeToken();
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256).not.toContain(token);
    expect(TOKEN_PATTERN.test(token)).toBe(true);
  });
});

describe('verifyBearer', () => {
  const TODAY = '2026-11-23';
  async function cfg(extra: Record<string, unknown> = {}) {
    const { token, sha256 } = await makeToken('b');
    const raw = JSON.stringify([{ id: 'gpt-sales', sha256, scopes: ['billing', 'invoices'], expires: '2027-02-21', ...extra }]);
    return { token, raw };
  }

  it('accepts a valid token and returns its id and scopes', async () => {
    const { token, raw } = await cfg();
    expect(await verifyBearer(`Bearer ${token}`, raw, TODAY)).toEqual({
      ok: true,
      tokenId: 'gpt-sales',
      scopes: ['billing', 'invoices'],
    });
  });

  it('refuses a missing header, wrong scheme, bad format and unknown token', async () => {
    const { token, raw } = await cfg();
    expect((await verifyBearer(null, raw, TODAY)).ok).toBe(false);
    expect((await verifyBearer('', raw, TODAY)).ok).toBe(false);
    expect(await verifyBearer(`Basic ${token}`, raw, TODAY)).toMatchObject({ ok: false, reason: 'bad_scheme' });
    expect(await verifyBearer('Bearer short', raw, TODAY)).toMatchObject({ ok: false, reason: 'bad_format' });
    expect(await verifyBearer(`Bearer ${token} extra`, raw, TODAY)).toMatchObject({ ok: false, reason: 'bad_scheme' });
    const other = (await makeToken('c')).token;
    expect(await verifyBearer(`Bearer ${other}`, raw, TODAY)).toMatchObject({ ok: false, reason: 'unknown_token' });
  });

  it('honours expiry through the last day, in Asia/Kolkata terms', async () => {
    const { token, raw } = await cfg({ expires: '2026-11-23' });
    expect((await verifyBearer(`Bearer ${token}`, raw, '2026-11-23')).ok).toBe(true);
    expect(await verifyBearer(`Bearer ${token}`, raw, '2026-11-24')).toMatchObject({ ok: false, reason: 'expired' });
  });

  it('fails closed when the configuration is missing or invalid', async () => {
    const { token } = await cfg();
    expect(await verifyBearer(`Bearer ${token}`, undefined, TODAY)).toMatchObject({ ok: false, reason: 'config_missing' });
    expect(await verifyBearer(`Bearer ${token}`, '[{"id":"x"}]', TODAY)).toMatchObject({ ok: false, reason: 'config_invalid' });
  });

  it('removing an entry revokes it on the next verification', async () => {
    const { token, raw } = await cfg();
    expect((await verifyBearer(`Bearer ${token}`, raw, TODAY)).ok).toBe(true);
    expect((await verifyBearer(`Bearer ${token}`, '[]', TODAY)).ok).toBe(false);
  });

  it('compares strings without an early exit', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
