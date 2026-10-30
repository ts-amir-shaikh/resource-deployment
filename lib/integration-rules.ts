import crypto from 'node:crypto';

/**
 * M62: the rules of the integration API that need no database — key handling
 * and what a receipt does to an invoice — so they can be tested directly.
 */

export const KEY_PREFIX = 'tsk_';

/** A new key: shown once to whoever issues it, stored only as its hash. */
export function generateKey(): string {
  return KEY_PREFIX + crypto.randomBytes(24).toString('hex');
}

export function hashKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** The key from an `Authorization: Bearer <key>` header, or null. */
export function bearerFrom(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return m ? m[1] : null;
}

export type KeyScope = 'read' | 'read-write';

export function scopeAllows(held: KeyScope, needed: KeyScope): boolean {
  return needed === 'read' || held === 'read-write';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type ReceiptInvoice = {
  amount: number;
  gstAmount: number;
  currency: string;
  status: 'not_raised' | 'raised' | 'pending_collection' | 'collected';
};

export type ReceiptOutcome =
  | { ok: true; received: number; tds: number; total: number; outstanding: number; collected: boolean }
  | { ok: false; reason: 'not-raised' | 'currency' | 'exceeds'; message: string };

/**
 * What an incoming receipt does. Collected is derived here from what has been
 * received plus TDS against the invoice total (amount + GST), never taken from
 * the caller. A receipt that would push the sum past the total is refused
 * rather than stored, so a wrong figure surfaces at the source.
 */
export function applyReceipt(
  invoice: ReceiptInvoice,
  earlier: { amount: number; tdsDeducted: number }[],
  incoming: { amount: number; tdsDeducted: number; currency: string },
): ReceiptOutcome {
  if (invoice.status === 'not_raised') {
    return { ok: false, reason: 'not-raised', message: 'This invoice has not been raised, so it cannot receive a payment.' };
  }
  if (incoming.currency !== invoice.currency) {
    return {
      ok: false,
      reason: 'currency',
      message: `This invoice is in ${invoice.currency}; a receipt in ${incoming.currency} cannot be applied. Amounts are never converted.`,
    };
  }
  const total = round2(invoice.amount + invoice.gstAmount);
  const received = round2(earlier.reduce((s, r) => s + r.amount, 0) + incoming.amount);
  const tds = round2(earlier.reduce((s, r) => s + r.tdsDeducted, 0) + incoming.tdsDeducted);
  if (round2(received + tds) > total) {
    return {
      ok: false,
      reason: 'exceeds',
      message: `Received ${received} plus TDS ${tds} would exceed the invoice total of ${total}.`,
    };
  }
  const outstanding = round2(total - received - tds);
  return { ok: true, received, tds, total, outstanding, collected: outstanding === 0 };
}
