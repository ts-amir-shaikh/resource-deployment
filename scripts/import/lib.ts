/**
 * Shared plumbing for the CSV bulk importers in this directory.
 *
 * Deliberately reuses the same Zod schemas the API validates against
 * (lib/validations.ts) — a row that the import script accepts is a row the
 * UI would also have accepted, and vice versa.
 */
import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { createClient, type Client } from '@libsql/client';
import type { ZodTypeAny, output } from 'zod';

export function getClient(): Client {
  const url = process.env.TURSO_DATABASE_URL ?? 'file:./data/deployment.db';
  const authToken = process.env.TURSO_AUTH_TOKEN;
  return createClient({ url, authToken });
}

export function targetLabel(): string {
  return process.env.TURSO_DATABASE_URL ? 'Turso' : 'local file (data/deployment.db)';
}

export type Row = Record<string, string>;

export function readCsv(path: string): Row[] {
  if (!fs.existsSync(path)) {
    console.error(`\nFile not found: ${path}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(path, 'utf8');
  try {
    return parse(raw, {
      columns: (header: string[]) => header.map((h) => h.trim()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      // A ragged row (one field short or long — the most common hand-edit
      // mistake, usually a stray or missing comma) gets a clear message
      // naming the line, rather than the parser's raw stack trace.
      relax_column_count: false,
    }) as Row[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const lineMatch = message.match(/on line (\d+)/);
    console.error(`\nCould not read ${path}:`);
    if (lineMatch) {
      console.error(
        `  Line ${lineMatch[1]} has a different number of columns than the header row.\n` +
          `  This is usually a stray or missing comma — open the file and check that line.`,
      );
    } else {
      console.error(`  ${message}`);
    }
    process.exit(1);
  }
}

/** Fails fast with a clear message when a required column is missing entirely
 *  — much more useful than 200 rows each reporting the same "required" error. */
export function checkHeaders(rows: Row[], required: string[]): void {
  if (rows.length === 0) {
    console.error('\nThe CSV has a header row but no data rows. Nothing to do.');
    process.exit(1);
  }
  const headers = new Set(Object.keys(rows[0]));
  const missing = required.filter((h) => !headers.has(h));
  if (missing.length) {
    console.error(
      `\nMissing required column(s): ${missing.join(', ')}\n` +
        `Found columns: ${[...headers].join(', ')}`,
    );
    process.exit(1);
  }
}

/** "" everywhere maps to undefined, so optional Zod fields see a genuinely
 *  absent value rather than an empty string that fails a format check. */
export function blankToUndefined(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v === '' ? undefined : v;
  return out;
}

/** Splits a delimited cell into a trimmed, non-empty string array. */
export function splitList(value: string | undefined, delimiter = ';'): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Strips thousands separators so "18,00,000" and "1,800,000" both parse. */
export function cleanNumber(value: string | undefined): string | undefined {
  if (value === undefined) return value;
  const cleaned = value.replace(/,/g, '').trim();
  return cleaned === '' ? undefined : cleaned;
}

export type ValidRow<T> = { row: number; data: T };
export type InvalidRow = { row: number; errors: string[] };

/**
 * Runs each CSV row through a Zod schema, tagging it with its spreadsheet row
 * number (header is row 1, so the first data row is row 2 — matching what a
 * user sees with the file open in Excel or Sheets).
 */
export function validateRows<S extends ZodTypeAny>(
  rows: Row[],
  schema: S,
  mapRow: (raw: Row, rowNum: number) => Record<string, unknown> | { __error: string },
): { valid: ValidRow<output<S>>[]; invalid: InvalidRow[] } {
  const valid: ValidRow<output<S>>[] = [];
  const invalid: InvalidRow[] = [];

  rows.forEach((raw, i) => {
    const rowNum = i + 2;
    const mapped = mapRow(raw, rowNum);
    // A plain Record<string, unknown> structurally overlaps { __error: string },
    // so narrow with an explicit cast rather than relying on `in` alone.
    if ('__error' in mapped) {
      invalid.push({ row: rowNum, errors: [(mapped as { __error: string }).__error] });
      return;
    }
    const parsed = schema.safeParse(mapped);
    if (parsed.success) {
      valid.push({ row: rowNum, data: parsed.data });
    } else {
      invalid.push({
        row: rowNum,
        errors: parsed.error.issues.map((iss) => `${iss.path.join('.') || 'row'}: ${iss.message}`),
      });
    }
  });

  return { valid, invalid };
}

export type Action<T> =
  | { kind: 'create'; row: number; data: T }
  | { kind: 'update'; row: number; data: T; id: number };

/**
 * Sorts validated rows into create / update / skip / duplicate-within-file,
 * against a map of existing DB records keyed the same way `keyOf` derives a
 * key from a row. Skip vs update is controlled by `--update`.
 */
export function planActions<T>(
  rows: ValidRow<T>[],
  existingByKey: Map<string, number>,
  keyOf: (data: T) => string,
  update: boolean,
): { actions: Action<T>[]; skipped: ValidRow<T>[]; duplicates: InvalidRow[] } {
  const actions: Action<T>[] = [];
  const skipped: ValidRow<T>[] = [];
  const duplicates: InvalidRow[] = [];
  const seenAt = new Map<string, number>();

  for (const r of rows) {
    const key = keyOf(r.data);
    const firstRow = seenAt.get(key);
    if (firstRow !== undefined) {
      duplicates.push({
        row: r.row,
        errors: [`duplicate of row ${firstRow} in this file (key: ${key}) — only the first occurrence is imported`],
      });
      continue;
    }
    seenAt.set(key, r.row);

    const existingId = existingByKey.get(key);
    if (existingId !== undefined && update) {
      actions.push({ kind: 'update', row: r.row, data: r.data, id: existingId });
    } else if (existingId !== undefined) {
      skipped.push(r);
    } else {
      actions.push({ kind: 'create', row: r.row, data: r.data });
    }
  }

  return { actions, skipped, duplicates };
}

export function printReport(opts: {
  entity: string;
  totalRows: number;
  invalid: InvalidRow[];
  duplicates: InvalidRow[];
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  commit: boolean;
}) {
  const { entity, totalRows, invalid, duplicates, toCreate, toUpdate, toSkip, commit } = opts;
  const line = '─'.repeat(52);

  console.log(`\n${entity}  ·  ${commit ? 'COMMIT' : 'DRY RUN — nothing written yet'}`);
  console.log(line);
  console.log(`  rows in file            ${totalRows}`);
  console.log(`  failed validation       ${invalid.length}`);
  console.log(`  duplicate within file   ${duplicates.length}`);
  console.log(`  → will create           ${toCreate}`);
  console.log(`  → will update           ${toUpdate}`);
  console.log(`  → unchanged (skipped)   ${toSkip}`);
  console.log(line);

  const problems = [...invalid, ...duplicates].sort((a, b) => a.row - b.row);
  if (problems.length) {
    console.log(`\n  Rows not imported:`);
    for (const p of problems) console.log(`    row ${p.row}: ${p.errors.join('; ')}`);
  }

  if (!commit && toCreate + toUpdate > 0) {
    console.log(`\n  This was a dry run. Add --commit to write ${toCreate + toUpdate} row(s).`);
  }
  if (commit) {
    console.log(`\n  Done — ${toCreate} created, ${toUpdate} updated, ${toSkip} left unchanged.`);
  }
  console.log('');
}
