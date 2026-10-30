/**
 * M62 (G-ACC-05): how much of a PO has been invoiced against it.
 *
 * Pure so the rules can be tested without a database. Money is never
 * converted between currencies, so an invoice in a different currency from
 * its agreement is not counted, only reported.
 */

/** Warn when this fraction of the PO value or less is left (D-A5 notes). */
export const PO_LOW_THRESHOLD = 0.15;

export type PoInvoice = {
  /** Before GST: the PO value covers the work, not the tax on it (D-A5). */
  amount: number;
  currency: string;
  status: 'not_raised' | 'raised' | 'pending_collection' | 'collected';
};

export type PoConsumption = {
  value: number;
  invoiced: number;
  remaining: number;
  /** Share of the value invoiced, 0 to 1 and beyond when over-invoiced. */
  consumed: number;
  state: 'ok' | 'low' | 'exhausted' | 'over';
  /** Invoices left out because they are in another currency than the PO. */
  otherCurrency: number;
};

export function poConsumption(
  agreement: { value: number; currency: string },
  invoiceRows: PoInvoice[],
): PoConsumption {
  let invoiced = 0;
  let otherCurrency = 0;
  for (const inv of invoiceRows) {
    // A draft that has not been raised has not consumed anything yet.
    if (inv.status === 'not_raised') continue;
    if (inv.currency !== agreement.currency) {
      otherCurrency++;
      continue;
    }
    invoiced += inv.amount;
  }
  const remaining = agreement.value - invoiced;
  const consumed = agreement.value > 0 ? invoiced / agreement.value : 0;
  const state: PoConsumption['state'] =
    remaining < 0
      ? 'over'
      : remaining === 0
        ? 'exhausted'
        : agreement.value > 0 && remaining / agreement.value <= PO_LOW_THRESHOLD
          ? 'low'
          : 'ok';
  return { value: agreement.value, invoiced, remaining, consumed, state, otherCurrency };
}
