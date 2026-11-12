import { describe, expect, it } from 'vitest';
import { canReverse, creditAllowed, settle, statusAfterSettlement } from './invoice-rules';
import { applyReceipt } from './integration-rules';
import { nextInvoiceStatus, isInvoiceOverdue } from './utils';
import { poConsumption } from './po-rules';
import { monthBounds, workingDaysInMonth, draftKey } from './invoice-drafts-rules';

const inv = (over: Partial<{ amount: number; gstAmount: number; status: string }> = {}) => ({ amount: 1000, gstAmount: 180, status: 'raised', ...over });

describe('settle', () => {
  it('owes the whole total when nothing has happened', () => {
    expect(settle(inv(), [], [])).toMatchObject({ total: 1180, credited: 0, netTotal: 1180, received: 0, outstanding: 1180, legacyPaid: false });
  });
  it('takes receipts and TDS off, and a credit note off the total', () => {
    const s = settle(inv(), [{ amount: 600, tdsDeducted: 40 }], [{ amount: 100, gstAmount: 18 }]);
    expect(s).toMatchObject({ netTotal: 1062, received: 600, tds: 40, outstanding: 422 });
  });
  it('counts a reversal (a negative counter-entry) back out', () => {
    const s = settle(inv(), [{ amount: 600, tdsDeducted: 0 }, { amount: -600, tdsDeducted: 0 }], []);
    expect(s.received).toBe(0);
    expect(s.outstanding).toBe(1180);
  });
  it('reads a Collected invoice with no receipts as paid in full (D-A2)', () => {
    expect(settle(inv({ status: 'collected' }), [], [])).toMatchObject({ legacyPaid: true, outstanding: 0 });
  });
  it('shows a negative outstanding when credit leaves the client overpaid', () => {
    expect(settle(inv(), [{ amount: 1180, tdsDeducted: 0 }], [{ amount: 1000, gstAmount: 180 }]).outstanding).toBe(-1180);
  });
});

describe('statusAfterSettlement', () => {
  const s = (received: number, tds = 0, credits: { amount: number; gstAmount: number }[] = [], status = 'raised') =>
    settle(inv({ status }), received || tds ? [{ amount: received, tdsDeducted: tds }] : [], credits);
  it('moves Raised to Pending to Collect on the first payment', () => {
    expect(statusAfterSettlement('raised', s(500))).toEqual({ status: 'pending_collection', collectedDate: 'keep' });
  });
  it('moves to Collected when received plus TDS covers the total', () => {
    expect(statusAfterSettlement('pending_collection', s(1100, 80))).toEqual({ status: 'collected', collectedDate: 'set' });
  });
  it('is Collected once credit notes bring the total down to what was paid', () => {
    expect(statusAfterSettlement('pending_collection', s(590, 0, [{ amount: 500, gstAmount: 90 }]))).toMatchObject({ status: 'collected' });
  });
  it('reopens a Collected invoice whose receipt was reversed', () => {
    const reversed = settle(inv({ status: 'collected' }), [{ amount: 1180, tdsDeducted: 0 }, { amount: -1180, tdsDeducted: 0 }], []);
    expect(statusAfterSettlement('collected', reversed)).toEqual({ status: 'pending_collection', collectedDate: 'clear' });
  });
  it('leaves a legacy Collected invoice and any unraised one alone', () => {
    expect(statusAfterSettlement('collected', settle(inv({ status: 'collected' }), [], [])).status).toBe('collected');
    expect(statusAfterSettlement('proforma', s(0)).status).toBe('proforma');
    expect(statusAfterSettlement('not_raised', s(0)).status).toBe('not_raised');
  });
  it('does not call a fully credited invoice with no payment Collected', () => {
    expect(statusAfterSettlement('raised', settle(inv(), [], [{ amount: 1000, gstAmount: 180 }])).status).toBe('raised');
  });
});

describe('creditAllowed', () => {
  it('refuses a draft and a proforma', () => {
    expect(creditAllowed(inv({ status: 'not_raised' }), [], { amount: 10, gstAmount: 0 }).ok).toBe(false);
    expect(creditAllowed(inv({ status: 'proforma' }), [], { amount: 10, gstAmount: 0 }).ok).toBe(false);
  });
  it('refuses nothing-to-credit and negative figures', () => {
    expect(creditAllowed(inv(), [], { amount: 0, gstAmount: 0 }).ok).toBe(false);
    expect(creditAllowed(inv(), [], { amount: -5, gstAmount: 0 }).ok).toBe(false);
  });
  it('allows a partial and a full credit, but never past the invoice together', () => {
    expect(creditAllowed(inv(), [], { amount: 400, gstAmount: 72 }).ok).toBe(true);
    expect(creditAllowed(inv(), [], { amount: 1000, gstAmount: 180 }).ok).toBe(true);
    expect(creditAllowed(inv(), [{ amount: 700, gstAmount: 126 }], { amount: 400, gstAmount: 0 }).ok).toBe(false);
    expect(creditAllowed(inv(), [{ amount: 100, gstAmount: 100 }], { amount: 10, gstAmount: 100 }).ok).toBe(false);
  });
  it('refuses GST on a foreign-currency invoice, which carries none', () => {
    expect(creditAllowed(inv({ gstAmount: 0 }), [], { amount: 10, gstAmount: 1 }).ok).toBe(false);
  });
});

describe('canReverse', () => {
  const all = [{ id: 1, amount: 500, reversesId: null }, { id: 2, amount: -500, reversesId: 1 }, { id: 3, amount: 200, reversesId: null }];
  it('reverses a live receipt once', () => {
    expect(canReverse(all[2], all).ok).toBe(true);
    expect(canReverse(all[0], all).ok).toBe(false);
  });
  it('never reverses a reversal', () => {
    expect(canReverse(all[1], all).ok).toBe(false);
  });
});

describe('applyReceipt with credits, proforma and legacy', () => {
  const base = { amount: 1000, gstAmount: 180, currency: 'INR', status: 'raised' as const };
  it('caps at the total net of credit notes', () => {
    expect(applyReceipt({ ...base, credited: 500 }, [], { amount: 700, tdsDeducted: 0, currency: 'INR' }).ok).toBe(false);
    expect(applyReceipt({ ...base, credited: 500 }, [], { amount: 680, tdsDeducted: 0, currency: 'INR' })).toMatchObject({ ok: true, collected: true });
  });
  it('refuses a proforma, and a legacy-collected invoice', () => {
    expect(applyReceipt({ ...base, status: 'proforma' }, [], { amount: 1, tdsDeducted: 0, currency: 'INR' }).ok).toBe(false);
    expect(applyReceipt({ ...base, status: 'collected' }, [], { amount: 1, tdsDeducted: 0, currency: 'INR' }).ok).toBe(false);
  });
});

describe('proforma in the lifecycle', () => {
  it('a plain advance skips the proforma', () => {
    expect(nextInvoiceStatus('not_raised')).toBe('raised');
    expect(nextInvoiceStatus('proforma')).toBe('raised');
    expect(nextInvoiceStatus('raised')).toBe('pending_collection');
  });
  it('is never overdue, and does not consume the PO', () => {
    expect(isInvoiceOverdue('proforma', '2000-01-01')).toBe(false);
    const po = poConsumption({ value: 1000, currency: 'INR' }, [{ amount: 900, currency: 'INR', status: 'proforma' }]);
    expect(po.invoiced).toBe(0);
  });
});

describe('PO consumption nets credit notes', () => {
  it('hands credited value back', () => {
    const po = poConsumption({ value: 1000, currency: 'INR' }, [{ amount: 900, currency: 'INR', status: 'raised', credited: 400 }]);
    expect(po.invoiced).toBe(500);
    expect(po.remaining).toBe(500);
  });
});

describe('monthly draft helpers', () => {
  it('finds the month bounds, leap year included', () => {
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(monthBounds('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
  it('counts weekdays less holidays', () => {
    expect(workingDaysInMonth('2026-10-01', '2026-10-31', new Set())).toBe(22);
    expect(workingDaysInMonth('2026-10-01', '2026-10-31', new Set(['2026-10-02', '2026-10-03']))).toBe(21);
  });
  it('keys a draft by project, agreement and currency', () => {
    expect(draftKey({ projectId: 1, agreementId: null, currency: 'INR' })).not.toBe(draftKey({ projectId: 1, agreementId: 2, currency: 'INR' }));
  });
});
