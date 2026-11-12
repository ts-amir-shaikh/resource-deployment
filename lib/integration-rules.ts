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
  status: 'not_raised' | 'proforma' | 'raised' | 'pending_collection' | 'collected';
  /** Credit notes against the invoice, GST included; they lower what can be received. */
  credited?: number;
};

/**
 * Whether an edit to an invoice's money still covers what has been paid on it.
 * Without this an edit could drop the total below receipts + TDS and leave a
 * negative outstanding. A receipt is in the invoice's currency (applyReceipt
 * refuses any other), so a currency change is refused once receipts exist.
 */
export function editFitsReceipts(
  edit: { amount: number; gstAmount: number; currency: string },
  stored: { currency: string; amount?: number; gstAmount?: number },
  receipts: { amount: number; tdsDeducted: number }[],
  credits: { amount: number; gstAmount: number }[] = [],
): { ok: true } | { ok: false; message: string } {
  // Credit notes were sized against the invoice as it stood, so its money is
  // fixed once any exist. A mistake is corrected with a further credit note.
  if (credits.length > 0) {
    if (
      edit.currency !== stored.currency ||
      (stored.amount !== undefined && round2(edit.amount) !== round2(stored.amount)) ||
      (stored.gstAmount !== undefined && round2(edit.gstAmount) !== round2(stored.gstAmount))
    ) {
      return { ok: false, message: 'Credit notes are issued against this invoice, so its amount, GST and currency can no longer change.' };
    }
  }
  if (receipts.length === 0) return { ok: true };
  if (edit.currency !== stored.currency) {
    return { ok: false, message: `Payments are already recorded in ${stored.currency}, so the currency cannot change.` };
  }
  const paid = round2(receipts.reduce((s, r) => s + r.amount + r.tdsDeducted, 0));
  const credited = round2(credits.reduce((s, c) => s + c.amount + c.gstAmount, 0));
  const total = round2(edit.amount + edit.gstAmount - credited);
  if (total < paid) {
    return { ok: false, message: `Payments and TDS of ${paid} are already recorded; the invoice total cannot go below that (new total ${total}).` };
  }
  return { ok: true };
}

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
  if (invoice.status === 'not_raised' || invoice.status === 'proforma') {
    return { ok: false, reason: 'not-raised', message: 'This invoice has not been raised, so it cannot receive a payment.' };
  }
  // D-A2: collected before receipts were tracked reads as paid in full.
  if (invoice.status === 'collected' && earlier.length === 0) {
    return { ok: false, reason: 'exceeds', message: 'This invoice was collected in full before payments were tracked, so no further payment can be applied.' };
  }
  if (incoming.currency !== invoice.currency) {
    return {
      ok: false,
      reason: 'currency',
      message: `This invoice is in ${invoice.currency}; a receipt in ${incoming.currency} cannot be applied. Amounts are never converted.`,
    };
  }
  const total = round2(invoice.amount + invoice.gstAmount - (invoice.credited ?? 0));
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
