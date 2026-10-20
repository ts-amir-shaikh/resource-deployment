/**
 * Turns rows into a CSV file a spreadsheet opens cleanly.
 *
 * Pure and dependency-free so the column definitions in lib/lists can be
 * shared by the list screens (the field picker) and the export routes (the
 * allowlist and the file itself) without pulling server code into the browser.
 */

export type CsvValue = string | number | boolean | null | undefined;

/**
 * One exportable field of a list. The registry of these is the whole
 * allowlist: a field that is not defined here cannot be exported.
 */
export type ExportColumn<Row> = {
  key: string;
  label: string;
  value: (row: Row) => CsvValue;
  /** Ticked in the picker the first time someone exports this list. */
  defaultOn?: boolean;
};

/**
 * Leads with Excel's byte-order mark so ₹ and non-English names display
 * correctly; without it Excel assumes the local code page.
 */
const BOM = '﻿';

/**
 * A cell starting with one of these is run as a formula by Excel and Sheets.
 * The data here comes partly from public forms (referrals, applications), so
 * a name like `=HYPERLINK(...)` must arrive as text, not as a live formula.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';

  // Negative numbers stored as text would trip the guard and pick up a quote;
  // they are numbers, so let them through untouched.
  let s = value;
  if (FORMULA_START.test(s) && !/^-\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<Row>(columns: ExportColumn<Row>[], rows: Row[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return BOM + lines.join('\r\n') + '\r\n';
}

/** `resources-2026-10-08.csv` */
export function csvFilename(list: string, date: string): string {
  return `${list}-${date}.csv`;
}
