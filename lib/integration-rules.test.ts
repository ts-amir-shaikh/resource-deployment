import { describe, expect, it } from 'vitest';
import { KEY_PREFIX, applyReceipt, bearerFrom, generateKey, hashKey, scopeAllows } from '@/lib/integration-rules';

describe('integration keys', () => {
  it('generates distinct prefixed keys and hashes them stably', () => {
    const a = generateKey();
    expect(a.startsWith(KEY_PREFIX)).toBe(true);
    expect(generateKey()).not.toBe(a);
    expect(hashKey(a)).toBe(hashKey(a));
    expect(hashKey(a)).not.toContain(a);
  });

  it('reads a bearer header and nothing else', () => {
    expect(bearerFrom('Bearer abc')).toBe('abc');
    expect(bearerFrom('bearer abc')).toBe('abc');
    expect(bearerFrom('Basic abc')).toBeNull();
    expect(bearerFrom('Bearer')).toBeNull();
    expect(bearerFrom(null)).toBeNull();
  });

  it('a read key cannot write, a read-write key can do both', () => {
    expect(scopeAllows('read', 'read')).toBe(true);
    expect(scopeAllows('read', 'read-write')).toBe(false);
    expect(scopeAllows('read-write', 'read')).toBe(true);
    expect(scopeAllows('read-write', 'read-write')).toBe(true);
  });
});

describe('applyReceipt', () => {
  const inv = { amount: 1000, gstAmount: 180, currency: 'INR', status: 'raised' as const };
  const money = (amount: number, tdsDeducted = 0, currency = 'INR') => ({ amount, tdsDeducted, currency });

  it('a part payment leaves the invoice open', () => {
    expect(applyReceipt(inv, [], money(500))).toMatchObject({ ok: true, outstanding: 680, collected: false });
  });

  it('received plus TDS covering the total collects it', () => {
    const r = applyReceipt(inv, [], money(1062, 118));
    expect(r).toMatchObject({ ok: true, total: 1180, outstanding: 0, collected: true });
  });

  it('adds to what was already received', () => {
    const r = applyReceipt(inv, [{ amount: 600, tdsDeducted: 0 }], money(500, 80));
    expect(r).toMatchObject({ ok: true, received: 1100, tds: 80, collected: true });
  });

  it('refuses a receipt that would exceed the total', () => {
    expect(applyReceipt(inv, [], money(1200))).toMatchObject({ ok: false, reason: 'exceeds' });
  });

  it('refuses an unraised invoice and another currency, without converting', () => {
    expect(applyReceipt({ ...inv, status: 'not_raised' }, [], money(10))).toMatchObject({ ok: false, reason: 'not-raised' });
    expect(applyReceipt(inv, [], money(10, 0, 'USD'))).toMatchObject({ ok: false, reason: 'currency' });
  });

  it('is not thrown by floating-point sums', () => {
    const r = applyReceipt({ ...inv, amount: 0.3, gstAmount: 0 }, [{ amount: 0.1, tdsDeducted: 0 }], money(0.2));
    expect(r).toMatchObject({ ok: true, collected: true });
  });
});
