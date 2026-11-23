import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Structural guarantees for the reporting API, enforced by scanning source so
 * they hold for code that has not been written yet:
 *   - reporting code reads through its own client, never the global one
 *   - nothing under lib/reporting can write (audit.ts excepted: one INSERT)
 *   - routes are GET-only and go through reportingHandle
 *   - the dataset modules never name a sensitive column
 */

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'lib', 'reporting');
const ROUTES = path.join(ROOT, 'app', 'api', 'reporting');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const libFiles = walk(LIB).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const routeFiles = walk(ROUTES).filter((f) => f.endsWith('route.ts'));
const rel = (f: string) => path.relative(ROOT, f);
const DATASETS = ['billing', 'invoices', 'capacity', 'pipeline', 'renewals'];

describe('reporting source layout', () => {
  it('finds what it scans', () => {
    expect(libFiles.length).toBeGreaterThan(10);
  });
});

describe('reporting code uses only its own database access', () => {
  const FORBIDDEN_IMPORT =
    /(?:from|import\()\s*['"](?:@\/lib\/(?:db|queries|session|accounts)(?:\/[^'"]*)?|\.{1,2}\/(?:db|queries|session)|\.{1,2}\/\.\.\/(?:db|queries|session|accounts)(?:\/[^'"]*)?|next\/headers)['"]/;

  for (const f of [...libFiles, ...routeFiles]) {
    if (f.endsWith(`${path.sep}audit.ts`)) continue;
    it(`${rel(f)} imports neither the global db, lib/queries, the session, accounts nor cookies`, () => {
      expect(FORBIDDEN_IMPORT.test(stripComments(readFileSync(f, 'utf8')))).toBe(false);
    });
  }

  it('audit.ts is the only file that reaches the global db, and only lazily', () => {
    const withDb = libFiles.filter((f) => /@\/lib\/db['"]/.test(stripComments(readFileSync(f, 'utf8'))));
    expect(withDb.map(rel)).toEqual([rel(path.join(LIB, 'audit.ts'))]);
    expect(stripComments(readFileSync(path.join(LIB, 'audit.ts'), 'utf8'))).not.toMatch(/^\s*import[^;]*@\/lib\/db/m);
  });

  it('never calls the one query helper that writes', () => {
    for (const f of [...libFiles, ...routeFiles]) {
      expect(stripComments(readFileSync(f, 'utf8')), rel(f)).not.toMatch(/syncExpiredAgreements/);
    }
  });
});

describe('reporting code cannot write', () => {
  // Only database handles are the concern: Map.delete and Headers.delete are not writes.
  const DB_MUTATOR = /\b(db|tx|client|conn)\s*\.\s*(insert|update|delete|run|batch|transaction|execute|executeMultiple)\s*\(/;
  const BUILDER_MUTATOR = /\)\s*\.(values|onConflictDoUpdate|onConflictDoNothing|returning)\s*\(/;
  const WRITE_SQL = /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|drop\s+(table|index)|alter\s+table|create\s+(table|index)|replace\s+into|pragma)\b/i;
  const DATASET_FILES = new Set(['billing.ts', 'invoices.ts', 'capacity.ts', 'pipeline.ts', 'renewals.ts', 'readonly-db.ts']);

  for (const f of [...libFiles, ...routeFiles]) {
    const name = path.basename(f);
    it(`${rel(f)} has no mutating call or SQL${name === 'audit.ts' ? ' beyond its one insert' : ''}`, () => {
      const src = stripComments(readFileSync(f, 'utf8'));
      if (name === 'audit.ts') {
        expect((src.match(new RegExp(DB_MUTATOR, 'g')) ?? []).length).toBe(1);
        expect(src).toMatch(/db\.insert\(reportingAuditLog\)\.values\(auditRow\(rec\)\)\.run\(\)/);
        expect(WRITE_SQL.test(src)).toBe(false);
        return;
      }
      expect(DB_MUTATOR.test(src)).toBe(false);
      expect(BUILDER_MUTATOR.test(src)).toBe(false);
      expect(WRITE_SQL.test(src)).toBe(false);
      // A query builder is terminated with .all()/.get(); .run() is how a write is executed.
      if (DATASET_FILES.has(name)) expect(/\.run\s*\(/.test(src.replace(/\bspec\.run\s*\(/g, ''))).toBe(false);
    });
  }
});

describe('reporting routes', () => {
  it('there is exactly one route per dataset', () => {
    expect(routeFiles.map((f) => path.basename(path.dirname(f))).sort()).toEqual([...DATASETS].sort());
  });

  for (const f of routeFiles) {
    it(`${rel(f)} exports GET only and goes through reportingHandle`, () => {
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(src).toMatch(/export\s+(async\s+)?function\s+GET\b/);
      expect(src).toMatch(/\breportingHandle\s*\(/);
      expect(src).not.toMatch(/export\s+(async\s+)?function\s+(POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/);
      expect(src).not.toMatch(/export\s+const\s+(POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/);
      expect(src).not.toMatch(/\bhandle\s*\(/);
      expect(src).not.toMatch(/getSession|getSessionState|requireCurrentAccount|getViewer/);
      expect(src).toMatch(/dynamic\s*=\s*['"]force-dynamic['"]/);
    });
  }
});

describe('dataset modules never name a sensitive column', () => {
  const SENSITIVE =
    /\.(currentCtc|revisedCtc|revisedEffectiveFrom|email|mobile|spoc\w*|account(Name|Email|Mobile)|altSpoc\w*|manager(Name|Email|Mobile|Designation)|passwordHash|passwordSalt|shareToken|dealValue|budgetMin|budgetMax|hiringBudget\w*|commissionAmount|operationsOverhead|invoiceNumber|agreementNumber|resumeUrl|jdContent|notes|feedback|fxRateToInr|exitNotes|exitDate)\b|\bresources\.name\b|\bcandidates\.(name|email)\b|current_ctc|revised_ctc|commission_amount|operations_overhead|deal_value|share_token|fx_rate_to_inr/;
  // exitDate is allowed in capacity.ts only, to exclude people who have left.
  for (const d of DATASETS) {
    const f = path.join(LIB, `${d}.ts`);
    it(`${d}.ts`, () => {
      let src: string;
      try {
        src = stripComments(readFileSync(f, 'utf8'));
      } catch {
        return; // not written yet
      }
      if (d === 'capacity') src = src.replace(/\.exitDate\b/g, '');
      expect(SENSITIVE.exec(src)?.[0]).toBeUndefined();
    });
  }
});
