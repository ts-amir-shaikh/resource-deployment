import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createFixture, type Fixture } from './helpers/reporting-fixture';
import { callReporting, moneyMap, type Json } from './helpers/reporting-call';
import { resetReportingDbForTests } from '@/lib/reporting/readonly-db';
import { FILLED_STATUSES } from '@/lib/reporting/pipeline';

/**
 * Reconciliation with the existing KPI definitions.
 *
 * The functions in lib/queries.ts are the specification: the dashboard has
 * shown their figures for months. Reporting does not call them in production
 * code (they use the global, writable database client), so each reporting
 * query is held to its original here, on the same scratch database. A failure
 * means one of the two definitions moved.
 *
 * Known, intended differences, each asserted below rather than hidden:
 *  - reporting dates are Asia/Kolkata; the originals use the UTC date
 *  - renewal exposure excludes superseded agreement versions
 *  - capped filled positions are new (the dashboard's "filledPositions" is
 *    reported as mappingsInFilledStatus)
 */

let fx: Fixture;
let q: typeof import('@/lib/queries');
const savedEnv = { ...process.env };

beforeAll(async () => {
  fx = await createFixture();
  process.env.TURSO_DATABASE_URL = fx.url;
  process.env.TURSO_AUTH_TOKEN = '';
  delete process.env.TURSO_READONLY_AUTH_TOKEN;
  process.env.REPORTING_AUDIT = 'log';
  delete (globalThis as { __db?: unknown }).__db;
  resetReportingDbForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  q = await import('@/lib/queries');

  // Extra open requirement with mappings in the three statuses that are NOT
  // "filled", so a change to which statuses count shows up on either side.
  await fx.client.execute(
    "INSERT INTO opportunities (id, client_id, company_name, title, required_count, stage, share_token) VALUES (8, 1, 'Acme', 'Role 8', 5, 'interview', 'share-token-sentinel-8')",
  );
  for (const [cand, status] of [[1, 'screening'], [2, 'submitted'], [3, 'interview']] as const) {
    await fx.client.execute({ sql: 'INSERT INTO opportunity_candidates (opportunity_id, candidate_id, status) VALUES (8, ?, ?)', args: [cand, status] });
  }
});

afterAll(() => {
  process.env = savedEnv;
  vi.restoreAllMocks();
});

describe('billing ↔ getBillingByClient', () => {
  it('matches per-client money by currency and headcount, and the totals', async () => {
    const oracle = await q.getBillingByClient();
    const rep = (await callReporting('billing', '?limit=500')).body.data;
    expect(rep.clients).toHaveLength(oracle.length);
    const totals = new Map<string, number>();
    for (const o of oracle) {
      const r = rep.clients.find((c: Json) => c.clientId === o.clientId);
      expect(r, `client ${o.clientName}`).toBeDefined();
      expect(moneyMap(r.contractedMonthly)).toEqual(moneyMap(o.billing));
      expect(r.billedResources).toBe(o.headcount);
      for (const b of o.billing) totals.set(b.currency, (totals.get(b.currency) ?? 0) + b.amount);
    }
    expect(moneyMap(rep.totals.contractedMonthly)).toEqual(Object.fromEntries(totals));
  });
});

describe('invoices ↔ getInvoiceSummary', () => {
  it('matches status totals, outstanding, overdue and the overdue count', async () => {
    const oracle = await q.getInvoiceSummary();
    const t = (await callReporting('invoices')).body.data.totals;
    const inv = (status: string) => moneyMap(oracle.byStatus[status]?.total ?? []);
    expect(moneyMap(t.markedCollected)).toEqual(inv('collected'));
    expect(moneyMap(t.notRaised)).toEqual(inv('not_raised'));
    expect(moneyMap(t.outstanding)).toEqual(moneyMap(oracle.outstandingAmount));
    expect(moneyMap(t.overdue)).toEqual(moneyMap(oracle.overdueAmount));
    expect(t.overdueCount).toBe(oracle.overdueCount);
    // invoiced = every status except not_raised
    const sum: Record<string, number> = {};
    for (const s of ['raised', 'pending_collection', 'collected']) {
      for (const [cur, amt] of Object.entries(inv(s))) sum[cur] = (sum[cur] ?? 0) + amt;
    }
    expect(moneyMap(t.invoiced)).toEqual(sum);
  });
});

describe('capacity ↔ getResourceUtilisation', () => {
  it('matches headcount, allocation and free capacity', async () => {
    const oracle = await q.getResourceUtilisation();
    const d = (await callReporting('capacity')).body.data;
    expect(d.headcount).toBe(oracle.length);
    const n = oracle.length;
    const avg = (f: (r: (typeof oracle)[number]) => number) => Math.round((oracle.reduce((s, r) => s + f(r), 0) / n) * 10) / 10;
    expect(d.allocation.billablePct).toBe(avg((r) => Math.min(100, r.billable)));
    expect(d.allocation.shadowPct).toBe(avg((r) => r.shadow));
    expect(d.bench.fullyBench).toBe(oracle.filter((r) => r.total === 0).length);
    expect(d.bench.fullyAllocated).toBe(oracle.filter((r) => r.free === 0).length);
    expect(d.bench.partiallyAvailable).toBe(oracle.filter((r) => r.free > 0 && r.total > 0).length);
    expect(d.bench.availableFte).toBe(Math.round((oracle.reduce((s, r) => s + r.free, 0) / 100) * 100) / 100);
  });
});

describe('pipeline ↔ getPipelineSummary', () => {
  it('matches stage counts, positions, closes, holds and follow-ups', async () => {
    const oracle = await q.getPipelineSummary();
    const r = (await callReporting('pipeline', '?include_terminal=true')).body.data;
    for (const [stage, v] of Object.entries(oracle.byStage)) {
      const row = r.byStage.find((s: Json) => s.stage === stage);
      expect(row, stage).toBeDefined();
      expect(row.requirements).toBe(v.count);
      expect(row.positions).toBe(v.positions);
    }
    expect(r.open.requirements).toBe(oracle.openCount);
    expect(r.open.positions).toBe(oracle.openPositions);
    expect(r.closedLast90d).toEqual({ won: oracle.won90d, lost: oracle.lost90d });
    expect(r.onHold).toBe(oracle.onHold);
    expect(r.followUpsDue).toBe(oracle.followUpsDue);
  });

  it('the dashboard "filledPositions" is the UNCAPPED figure; the capped figure is new and never larger', async () => {
    const oracle = await q.getPipelineSummary();
    const o = (await callReporting('pipeline')).body.data.open;
    expect(o.mappingsInFilledStatus).toBe(oracle.filledPositions);
    expect(o.filledPositions).toBeLessThan(o.mappingsInFilledStatus); // requirement 1 is over-filled in the fixture
    expect(o.filledPositions).toBeLessThanOrEqual(o.positions);
  });

  it('counts the same mapping statuses as filled (selected, offered, joined)', () => {
    expect([...FILLED_STATUSES]).toEqual(['selected', 'offered', 'joined']);
    // The extra requirement above holds screening/submitted/interview mappings; if either side counted them
    // as filled, mappingsInFilledStatus would no longer equal the original on the previous test.
  });
});

describe('renewals ↔ getExpiringAgreements and getEndingSoon', () => {
  it('lists the same agreements, minus superseded versions', async () => {
    const oracle = await q.getExpiringAgreements(90);
    const rep = (await callReporting('renewals', '?window_days=90&lapsed_within_days=365&limit=500')).body.data.agreements;
    const oracleTitles = oracle.map((a) => a.title).sort();
    // The original lists AG5 (still marked active although AG6 supersedes it) and has no look-back limit.
    expect(oracleTitles).toEqual(['Agreement 3', 'Agreement 4', 'Agreement 5', 'Agreement 8']);
    const repTitles = rep.items.map((i: Json) => i.title).filter((t: string) => t !== 'Agreement 7'); // AG7 has status expired
    expect(repTitles.sort()).toEqual(oracleTitles.filter((t) => t !== 'Agreement 5'));
    expect(rep.dataQuality.supersededButActive).toBe(1);
    for (const o of oracle.filter((a) => a.title !== 'Agreement 5')) {
      const i = rep.items.find((x: Json) => x.agreementId === o.id);
      expect(i.value).toBe(o.value);
      expect(i.endDate).toBe(o.endDate);
      expect(i.currency).toBe(o.currency);
    }
  });

  it('counts the same deployments as ending (in the window or already past it)', async () => {
    const oracle = await q.getEndingSoon(90);
    const dep = (await callReporting('renewals')).body.data.deployments;
    const total = dep.byBucket.reduce((n: number, b: Json) => n + b.count, 0);
    expect(total).toBe(oracle.length);
    const oracleBilling = oracle.filter((d) => d.endDate && d.endDate >= fx.today).reduce((s, d) => s + d.billingAmount, 0);
    const repBilling = dep.monthlyBillingEnding.reduce((s: number, m: Json) => s + m.amount, 0);
    // Mixed currencies in the fixture (INR and USD): compare the sum of the raw amounts, not a converted figure.
    expect(repBilling).toBe(oracleBilling);
  });
});
