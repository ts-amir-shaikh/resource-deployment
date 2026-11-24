/**
 * Money in the reporting API is always per currency and never converted.
 * These helpers only group and add within one currency.
 */

export type Currency = 'INR' | 'AED' | 'USD';
export const CURRENCY_ORDER: readonly Currency[] = ['INR', 'AED', 'USD'];
export type MoneyByCurrency = { currency: Currency; amount: number }[];

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Adds `amount` to `currency` in a running map. */
export function addTo(map: Map<Currency, number>, currency: Currency, amount: number): void {
  map.set(currency, (map.get(currency) ?? 0) + (amount ?? 0));
}

/** A running map as a stable array: INR, AED, USD order, rounded to 2 places. */
export function toMoney(map: Map<Currency, number>): MoneyByCurrency {
  return CURRENCY_ORDER.filter((c) => map.has(c)).map((currency) => ({
    currency,
    amount: round2(map.get(currency) ?? 0),
  }));
}

export function sumMoney(rows: { currency: Currency; amount: number }[]): MoneyByCurrency {
  const m = new Map<Currency, number>();
  for (const r of rows) addTo(m, r.currency, r.amount);
  return toMoney(m);
}

export function isCurrency(v: unknown): v is Currency {
  return v === 'INR' || v === 'AED' || v === 'USD';
}
