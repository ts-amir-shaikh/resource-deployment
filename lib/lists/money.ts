import { CURRENCY_OPTIONS, type Currency, type MoneyByCurrency } from '@/lib/utils';
import type { ExportColumn } from '@/lib/export/csv';

/**
 * One column per currency for a multi-currency total. A single "INR 1,20,000
 * + AED 5,000" cell reads well on screen but cannot be summed in a sheet;
 * three numeric columns can.
 */
export function moneyColumns<Row>(
  key: string,
  label: string,
  get: (row: Row) => MoneyByCurrency,
  defaultOn = false,
): ExportColumn<Row>[] {
  return CURRENCY_OPTIONS.map(({ value }) => ({
    key: `${key}${value}`,
    label: `${label} (${value})`,
    value: (row: Row) => amountIn(get(row), value),
    // Rupees is the common case; the other two start unticked.
    defaultOn: defaultOn && value === 'INR',
  }));
}

function amountIn(list: MoneyByCurrency, currency: Currency): number | null {
  return list.find((m) => m.currency === currency)?.amount ?? null;
}
