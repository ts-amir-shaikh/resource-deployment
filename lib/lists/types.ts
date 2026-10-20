import type { ExportColumn } from '@/lib/export/csv';

/**
 * Everything about one list that both its screen and its export route need.
 *
 * Pure — no database, no 'server-only' — so the list's client component imports
 * the same filter the export route runs. That shared function is what makes
 * "export what the filters show" (R5) true by construction rather than by two
 * copies of the logic agreeing. Loading the rows is server work and lives in
 * lib/lists/load.ts.
 */
export type ListDef<Row extends { id: number }, Filters> = {
  /** Slug for the filename and the export log: `resources-2026-10-08.csv`. */
  list: string;
  /** The export allowlist and the field picker, in file order. */
  columns: ExportColumn<Row>[];
  filterRows: (rows: Row[], filters: Filters) => Row[];
  /** Filters → query params. Leaves out values at their default. */
  toParams: (filters: Filters) => Record<string, string>;
  fromParams: (params: URLSearchParams) => Filters;
};

/** The few lines every list's search box repeats. */
export function matchesSearch(q: string, ...values: (string | null | undefined)[]): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return values.some((v) => (v ?? '').toLowerCase().includes(needle));
}

/** Drops unset and default values so the URL and the log stay short. */
export function compactParams(
  entries: Record<string, string | null | undefined>,
  defaults: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) {
    if (v === null || v === undefined || v === '' || v === defaults[k]) continue;
    out[k] = v;
  }
  return out;
}

/** Reads one of a fixed set of values, falling back to the default. */
export function oneOf<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}
