/**
 * M62 slices B and C: what receipts, credit notes and the proforma state do to
 * an invoice. Pure, so every rule is tested without a database.
 *
 * Money is never converted. A receipt or a credit note is in the invoice's own
 * currency, and every figure here is within that one currency.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceMoney = { amount: number; gstAmount: number; status: string };
export type ReceiptMoney = { amount: number; tdsDeducted: number };
export type CreditMoney = { amount: number; gstAmount: number };

export type Settlement = {
  /** Invoice amount plus GST, before any credit. */
  total: number;
  /** Credit notes, GST included. */
  credited: number;
  /** What the client still owes the invoice for: total less credits. */
  netTotal: number;
  received: number;
  tds: number;
  /** Net total less received and TDS. Negative means the client overpaid, a refund is due. */
  outstanding: number;
  /**
   * The invoice was Collected before receipts were tracked (D-A2). Nothing
   * about it is rewritten: it reads as paid in full.
   */
  legacyPaid: boolean;
};

export function settle(invoice: InvoiceMoney, receipts: ReceiptMoney[], credits: CreditMoney[]): Settlement {
  const total = round2(invoice.amount + invoice.gstAmount);
  const credited = round2(credits.reduce((s, c) => s + c.amount + c.gstAmount, 0));
  const netTotal = round2(total - credited);
  const legacyPaid = invoice.status === 'collected' && receipts.length === 0;
  if (legacyPaid) {
    return { total, credited, netTotal, received: netTotal, tds: 0, outstanding: 0, legacyPaid };
  }
  const received = round2(receipts.reduce((s, r) => s + r.amount, 0));
  const tds = round2(receipts.reduce((s, r) => s + r.tdsDeducted, 0));
  return { total, credited, netTotal, received, tds, outstanding: round2(netTotal - received - tds), legacyPaid };
}

export type StatusMove = { status: string; collectedDate: 'set' | 'clear' | 'keep' };

/**
 * The status an invoice takes after a receipt, reversal or credit note.
 *
 * Derived from the ledger, never from the caller. Two moves are driven by it:
 * the first payment takes a Raised invoice to Pending to Collect, and a
 * reversal that reopens a Collected invoice takes it back to Pending to
 * Collect. That is the one backward step in the lifecycle, and it exists
 * because Collected means "the receipts cover it".
 */
export function statusAfterSettlement(status: string, s: Settlement): StatusMove {
  if (status === 'not_raised' || status === 'proforma') return { status, collectedDate: 'keep' };
  const paidSomething = s.received + s.tds > 0;
  if (s.legacyPaid) return { status, collectedDate: 'keep' };
  if (paidSomething && s.outstanding <= 0) return { status: 'collected', collectedDate: status === 'collected' ? 'keep' : 'set' };
  if (status === 'collected') return { status: 'pending_collection', collectedDate: 'clear' };
  if (paidSomething && status === 'raised') return { status: 'pending_collection', collectedDate: 'keep' };
  return { status, collectedDate: 'keep' };
}

export type CreditOutcome = { ok: true } | { ok: false; message: string };

/**
 * Whether a credit note may be issued. Only a raised invoice can be credited
 * (a draft is simply edited or left), and the credits together never exceed
 * the invoice, amount and GST each.
 */
export function creditAllowed(
  invoice: InvoiceMoney,
  earlier: CreditMoney[],
  incoming: CreditMoney,
): CreditOutcome {
  if (invoice.status === 'not_raised' || invoice.status === 'proforma') {
    return { ok: false, message: 'Only a raised invoice can be credited. Edit this one instead.' };
  }
  if (!(incoming.amount >= 0) || !(incoming.gstAmount >= 0) || incoming.amount + incoming.gstAmount <= 0) {
    return { ok: false, message: 'A credit note needs an amount greater than 0.' };
  }
  const creditedAmount = round2(earlier.reduce((s, c) => s + c.amount, 0));
  const creditedGst = round2(earlier.reduce((s, c) => s + c.gstAmount, 0));
  if (round2(creditedAmount + incoming.amount) > round2(invoice.amount)) {
    return {
      ok: false,
      message: `Credits would reach ${round2(creditedAmount + incoming.amount)}, more than the invoice amount of ${invoice.amount}.`,
    };
  }
  if (round2(creditedGst + incoming.gstAmount) > round2(invoice.gstAmount)) {
    return {
      ok: false,
      message: `GST credits would reach ${round2(creditedGst + incoming.gstAmount)}, more than the invoice GST of ${invoice.gstAmount}.`,
    };
  }
  return { ok: true };
}

export type StoredReceipt = { id: number; amount: number; reversesId: number | null };

/** A receipt can be reversed once, and a reversal cannot itself be reversed. */
export function canReverse(receipt: StoredReceipt, all: StoredReceipt[]): CreditOutcome {
  if (receipt.reversesId !== null || receipt.amount <= 0) {
    return { ok: false, message: 'A reversal cannot be reversed. Record a new receipt instead.' };
  }
  if (all.some((r) => r.reversesId === receipt.id)) {
    return { ok: false, message: 'This receipt has already been reversed.' };
  }
  return { ok: true };
}

/**
 * Proforma and the tax invoice (D15). The lifecycle stays forward-only:
 * not_raised -> proforma -> raised. A proforma is optional, so Raised can be
 * reached without it, but nothing moves back to it. A proforma cannot be
 * collected against.
 */
export function isPreInvoice(status: string): boolean {
  return status === 'not_raised' || status === 'proforma';
}
