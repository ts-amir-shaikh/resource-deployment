import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as billingGET } from '@/app/api/reporting/v1/billing/route';
import { GET as invoicesGET } from '@/app/api/reporting/v1/invoices/route';
import { GET as capacityGET } from '@/app/api/reporting/v1/capacity/route';
import { GET as pipelineGET } from '@/app/api/reporting/v1/pipeline/route';
import { GET as renewalsGET } from '@/app/api/reporting/v1/renewals/route';
import { istToday } from '@/lib/reporting/dates';
import { getReportingDb, ReportingConfigError, resetReportingDbForTests } from '@/lib/reporting/readonly-db';
import { SENTINELS, createFixture, snapshot, type Fixture } from './helpers/reporting-fixture';
import { tokenEnv } from './helpers/reporting';
import type { ReportingScope } from '@/lib/reporting/paths';

/**
 * End-to-end through the real route handlers, the real audit insert and a
 * scratch libSQL file with mock data: the five contracts, the leakage and
 * no-write guarantees, and the financial figures worked out by hand from the
 * fixture (tests/helpers/reporting-fixture.ts).
 */

type Json = Record<string, any>;
const handlers: Record<ReportingScope, (req: Request) => Promise<Response>> = {
  billing: billingGET,
  invoices: invoicesGET,
  capacity: capacityGET,
  pipeline: pipelineGET,
  renewals: renewalsGET,
};
const ALL: ReportingScope[] = ['billing', 'invoices', 'capacity', 'pipeline', 'renewals'];

let fx: Fixture;
let seq = 0;
const savedEnv = { ...process.env };

/** A fresh token id per call group so the per-instance throttle never interferes. */
async function newToken(scopes: ReportingScope[] = ALL) {
  seq++;
  const t = await tokenEnv({ id: `it-${seq}`, seed: String.fromCharCode(97 + (seq % 26)), scopes });
  process.env.REPORTING_TOKENS = t.raw;
  return { ...t, id: `it-${seq}` };
}

async function get(scope: ReportingScope, qs = '', token?: string): Promise<{ status: number; body: Json; headers: Headers }> {
  const t = token ?? (await newToken()).token;
  const res = await handlers[scope](
    new Request(`http://localhost/api/reporting/v1/${scope}${qs}`, { headers: { authorization: `Bearer ${t}` } }),
  );
  return { status: res.status, body: await res.json(), headers: res.headers };
}

const money = (arr: { currency: string; amount: number }[]) => Object.fromEntries(arr.map((m) => [m.currency, m.amount]));

function keysOf(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => keysOf(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      keysOf(v, out);
    }
  }
  return out;
}

beforeAll(async () => {
  fx = await createFixture();
  process.env.TURSO_DATABASE_URL = fx.url;
  process.env.TURSO_AUTH_TOKEN = '';
  delete process.env.TURSO_READONLY_AUTH_TOKEN;
  process.env.REPORTING_AUDIT = 'table';
  delete process.env.REPORTING_AUDIT_FAILURE_MODE;
  delete process.env.REPORTING_ALERTING_VERIFIED;
  delete (globalThis as { __db?: unknown }).__db;
  resetReportingDbForTests();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  process.env = savedEnv;
  vi.restoreAllMocks();
});

/* ── Contracts: envelope, keys, leakage ───────────────────────── */

const EXPECTED_KEYS: Record<ReportingScope, string[]> = {
  billing: ['totals', 'contractedMonthly', 'activeBillableDeployments', 'billedResources', 'clients', 'clientId', 'clientName', 'projects', 'currency', 'amount'],
  invoices: [
    'totals', 'invoiced', 'notRaised', 'outstanding', 'overdue', 'markedCollected', 'overdueCount', 'aging', 'currency', 'notYetDue',
    'd1_30', 'd31_60', 'd61_90', 'd90plus', 'noDueDate', 'clients', 'clientId', 'clientName', 'invoiceCount', 'oldestOverdueDays', 'amount',
  ],
  capacity: [
    'headcount', 'allocation', 'billablePct', 'shadowPct', 'freePct', 'utilisationPct', 'bench', 'fullyBench', 'partiallyAvailable',
    'fullyAllocated', 'shadowOnly', 'availableFte', 'bySkill', 'primarySkill',
  ],
  pipeline: [
    'byStage', 'stage', 'requirements', 'positions', 'mappedCandidates', 'mapped', 'screening', 'submitted', 'interview', 'selected',
    'offered', 'joined', 'rejected', 'withdrawn', 'open', 'filledPositions', 'unfilledPositions', 'fulfilmentPct', 'mappingsInFilledStatus',
    'closedLast90d', 'won', 'lost', 'onHold', 'followUpsDue', 'byClient', 'clientId', 'clientName', 'openRequirements', 'openPositions',
  ],
  renewals: [
    'agreements', 'chainHeads', 'expiring', 'lapsed', 'alreadyRenewed', 'exposureByBucket', 'bucket', 'count', 'contractValue', 'currency',
    'amount', 'items', 'agreementId', 'clientId', 'clientName', 'projectName', 'title', 'value', 'endDate', 'daysToExpiry', 'state',
    'renewalVersion', 'dataQuality', 'supersededButActive', 'deployments', 'endingInWindow', 'openEnded', 'monthlyBillingEnding', 'byBucket', 'monthlyBilling',
  ],
};

const FORBIDDEN_KEY = /ctc|salary|email|mobile|phone|resume|token|hash|password|notes|commission|overhead|margin|budget|deal|jd|spoc|manager|designation|exit|fx|invoicenumber|agreementnumber|name$/i;

describe('the five contracts', () => {
  for (const scope of ALL) {
    it(`${scope}: standard envelope, exact key set, no sensitive keys`, async () => {
      const { status, body, headers } = await get(scope);
      expect(status).toBe(200);
      expect(headers.get('cache-control')).toBe('no-store');
      expect(body.meta).toMatchObject({
        version: 'v1',
        asOf: istToday(),
        timezone: 'Asia/Kolkata',
        scope: `reporting:${scope}`,
        currencyPolicy: 'per-currency, never converted',
      });
      expect(typeof body.meta.generatedAt).toBe('string');
      expect(Array.isArray(body.meta.notes)).toBe(true);
      expect(body.meta.notes.length).toBeGreaterThan(0);

      const keys = [...keysOf(body.data)];
      expect(keys.sort()).toEqual([...EXPECTED_KEYS[scope]].sort());
      // clientName/projectName/title/primarySkill are the only "name"-like keys allowed, by design (D3).
      for (const k of keys.filter((k) => FORBIDDEN_KEY.test(k))) {
        expect(['clientName', 'projectName'], `${scope} returned key ${k}`).toContain(k);
      }
    });

    it(`${scope}: contains no sentinel value from any sensitive column`, async () => {
      const text = JSON.stringify((await get(scope, '?limit=500')).body);
      for (const s of SENTINELS) expect(text, `${scope} leaked ${s}`).not.toContain(s);
    });
  }

  it('pipeline with every optional view still leaks nothing', async () => {
    const text = JSON.stringify((await get('pipeline', '?include_terminal=true&limit=500')).body);
    for (const s of SENTINELS) expect(text).not.toContain(s);
  });
});

/* ── Authentication and scope through the handlers ────────────── */

describe('authentication and authorization', () => {
  it('refuses missing, malformed and unknown tokens with one identical body', async () => {
    await newToken();
    const bodies = new Set<string>();
    for (const headers of [{}, { authorization: 'Bearer x' }, { authorization: `Bearer rpt_${'z'.repeat(43)}` }, { authorization: 'Basic abc' }] as Record<string, string>[]) {
      const res = await billingGET(new Request('http://localhost/api/reporting/v1/billing', { headers }));
      expect(res.status).toBe(401);
      bodies.add(JSON.stringify((await res.json()).error));
    }
    expect(bodies.size).toBe(1);
  });

  it('enforces dataset scope: a token for one dataset cannot read the other four', async () => {
    for (const granted of ALL) {
      const t = await newToken([granted]);
      for (const asked of ALL) {
        const { status } = await get(asked, '', t.token);
        expect(status, `${granted} token on ${asked}`).toBe(asked === granted ? 200 : 403);
      }
    }
  });

  it('refuses an expired token and a removed (revoked) token', async () => {
    const expired = await tokenEnv({ id: 'old', expires: '2020-01-01' });
    process.env.REPORTING_TOKENS = expired.raw;
    expect((await get('billing', '', expired.token)).status).toBe(401);
    const t = await newToken();
    expect((await get('billing', '', t.token)).status).toBe(200);
    process.env.REPORTING_TOKENS = '[]';
    expect((await get('billing', '', t.token)).status).toBe(401);
  });

  it('refuses every method but GET', async () => {
    const t = await newToken();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const res = await billingGET(
        new Request('http://localhost/api/reporting/v1/billing', { method, headers: { authorization: `Bearer ${t.token}` } }),
      );
      expect(res.status).toBe(405);
    }
  });
});

/* ── Parameters ───────────────────────────────────────────────── */

describe('invalid parameters', () => {
  it.each([
    ['billing', '?limit=0'],
    ['billing', '?limit=501'],
    ['billing', '?currency=EUR'],
    ['billing', '?unknown=1'],
    ['invoices', '?from=2026-02-30'],
    ['invoices', '?as_of=2999-01-01'],
    ['invoices', '?from=2020-01-01&to=2026-01-01'],
    ['capacity', '?min_free=101'],
    ['pipeline', '?stage=nonsense'],
    ['pipeline', '?include_terminal=maybe'],
    ['renewals', '?window_days=366'],
    ['renewals', '?lapsed_within_days=-1'],
    ['renewals', '?limit=1&limit=2'],
  ] as [ReportingScope, string][])('%s%s → 422', async (scope, qs) => {
    const { status, body } = await get(scope, qs);
    expect(status).toBe(422);
    expect(body.error.code).toBe('invalid_parameter');
  });
});

/* ── Financial figures, worked out by hand ────────────────────── */

describe('billing (contracted)', () => {
  it('separates currencies and counts each person once overall', async () => {
    const { body } = await get('billing');
    const d = body.data;
    // Active billable: D1 100000 + D2 60000 (Acme INR); D3 40000 + D9 30000 INR and D4 2000 USD (Beta); D5 8000 AED (Gamma).
    expect(money(d.totals.contractedMonthly)).toEqual({ INR: 230000, AED: 8000, USD: 2000 });
    expect(d.totals.contractedMonthly.map((m: Json) => m.currency)).toEqual(['INR', 'AED', 'USD']);
    expect(d.totals.activeBillableDeployments).toBe(6);
    // r1, r2, r3, r4, r9: r2 is billed to two clients but is one person.
    expect(d.totals.billedResources).toBe(5);
    const byName = Object.fromEntries(d.clients.map((c: Json) => [c.clientName, c]));
    expect(money(byName.Acme.contractedMonthly)).toEqual({ INR: 160000 });
    expect(byName.Acme).toMatchObject({ activeBillableDeployments: 2, projects: 1, billedResources: 2 });
    expect(money(byName.Beta.contractedMonthly)).toEqual({ INR: 70000, USD: 2000 });
    expect(byName.Beta).toMatchObject({ activeBillableDeployments: 3, billedResources: 3 });
    expect(money(byName.Gamma.contractedMonthly)).toEqual({ AED: 8000 });
    // The per-client counts sum to more than the overall distinct count (r2).
    expect(d.clients.reduce((n: number, c: Json) => n + c.billedResources, 0)).toBe(6);
  });

  it('D6 fixture: a 60/40 split is summed as entered, not weighted by allocation', async () => {
    const { body } = await get('billing', '?client_id=1');
    // r2's 60% share is billed 60000 and its 40% share (Beta) 40000: full rate 100000.
    expect(money(body.data.totals.contractedMonthly).INR).toBe(160000); // 100000 (r1) + 60000, not 60000 x 0.6
  });

  it('filters by currency and client, and ignores shadow and ended deployments', async () => {
    const usd = (await get('billing', '?currency=USD')).body.data;
    expect(money(usd.totals.contractedMonthly)).toEqual({ USD: 2000 });
    expect(usd.clients).toHaveLength(1);
    expect((await get('billing', '?client_id=3')).body.data.clients[0].clientName).toBe('Gamma');
  });

  it('paginates deterministically', async () => {
    const page = (await get('billing', '?limit=2&offset=0')).body;
    expect(page.data.clients.map((c: Json) => c.clientName)).toEqual(['Acme', 'Beta']);
    expect(page.meta.pagination).toEqual({ limit: 2, offset: 0, total: 3, truncated: true });
    const next = (await get('billing', '?limit=2&offset=2')).body;
    expect(next.data.clients.map((c: Json) => c.clientName)).toEqual(['Gamma']);
    expect(next.meta.pagination.truncated).toBe(false);
    // Totals describe everyone, not the page.
    expect(next.data.totals.activeBillableDeployments).toBe(6);
  });
});

describe('invoices (invoiced, outstanding, aging)', () => {
  it('reports amount plus GST per currency with drafts and collected kept apart', async () => {
    const { body } = await get('invoices');
    const t = body.data.totals;
    expect(money(t.invoiced)).toEqual({ INR: 316800, AED: 5000, USD: 2000 });
    expect(money(t.notRaised)).toEqual({ INR: 82600 });
    expect(money(t.outstanding)).toEqual({ INR: 222400, AED: 5000, USD: 2000 });
    expect(money(t.overdue)).toEqual({ INR: 212400, AED: 5000 });
    expect(money(t.markedCollected)).toEqual({ INR: 94400 });
    expect(t.overdueCount).toBe(4);
    expect(body.meta.notes.join(' ')).toMatch(/not a verified cash receipt/);
  });

  it('ages outstanding invoices from the due date at the Asia/Kolkata as-of date', async () => {
    const { aging } = (await get('invoices')).body.data;
    expect(aging.map((a: Json) => a.currency)).toEqual(['INR', 'AED', 'USD']);
    expect(aging[0]).toEqual({ currency: 'INR', notYetDue: 0, d1_30: 59000, d31_60: 118000, d61_90: 0, d90plus: 35400, noDueDate: 10000 });
    expect(aging[1]).toMatchObject({ currency: 'AED', d1_30: 5000 });
    expect(aging[2]).toMatchObject({ currency: 'USD', notYetDue: 2000 });
  });

  it('aging reconciles: the buckets add up to outstanding, per currency', async () => {
    const { totals, aging } = (await get('invoices')).body.data;
    const out = money(totals.outstanding);
    for (const a of aging) {
      const sum = a.notYetDue + a.d1_30 + a.d31_60 + a.d61_90 + a.d90plus + a.noDueDate;
      expect(Math.round(sum * 100) / 100).toBe(out[a.currency]);
    }
  });

  it('gives per-client, per-currency rows', async () => {
    const rows = (await get('invoices')).body.data.clients as Json[];
    expect(rows.map((r) => `${r.clientName}/${r.currency}`)).toEqual(['Acme/INR', 'Beta/INR', 'Beta/USD', 'Gamma/INR', 'Gamma/AED']);
    expect(rows[0]).toEqual({
      clientId: 1, clientName: 'Acme', currency: 'INR', invoiced: 271400, outstanding: 177000, overdue: 177000,
      markedCollected: 94400, invoiceCount: 3, oldestOverdueDays: 45,
    });
    expect(rows[1]).toMatchObject({ invoiced: 10000, overdue: 0, oldestOverdueDays: null });
    expect(rows[3]).toMatchObject({ oldestOverdueDays: 120 });
  });

  it('filters by client, currency and invoice date', async () => {
    const acme = (await get('invoices', '?client_id=1')).body.data.totals;
    expect(money(acme.invoiced)).toEqual({ INR: 271400 });
    const usd = (await get('invoices', '?currency=USD')).body.data.totals;
    expect(money(usd.invoiced)).toEqual({ USD: 2000 });
    const { d } = fx;
    const windowed = (await get('invoices', `?from=${d(-30)}&to=${d(0)}`)).body.data.totals;
    expect(money(windowed.invoiced)).toEqual({ INR: 59000 });
    expect(windowed.notRaised).toEqual([]);
  });

  it('an invoice due on the as-of date is not yet overdue; the next day it is one day past', async () => {
    const { d } = fx;
    const onDue = (await get('invoices', `?as_of=${d(-5)}`)).body.data;
    const i2 = onDue.aging.find((a: Json) => a.currency === 'INR');
    expect(i2.notYetDue).toBeGreaterThanOrEqual(59000); // I2 (due d-5) is not yet due on d-5
    const dayAfter = (await get('invoices', `?as_of=${d(-4)}`)).body.data.aging.find((a: Json) => a.currency === 'INR');
    expect(dayAfter.d1_30).toBeGreaterThanOrEqual(59000); // one day past due on d-4
  });
});

describe('capacity (allocation-based)', () => {
  it('derives utilisation and bench from active allocation only', async () => {
    const d = (await get('capacity')).body.data;
    expect(d.headcount).toBe(8); // r7 has left
    expect(d.allocation).toEqual({ billablePct: 53.8, shadowPct: 15, freePct: 31.3 });
    expect(d.utilisationPct).toBe(53.8);
    expect(d.bench).toEqual({ fullyBench: 2, partiallyAvailable: 1, fullyAllocated: 5, shadowOnly: 1, availableFte: 2.5 });
    expect(d.bySkill).toEqual([
      { primarySkill: 'Java', headcount: 4, availableFte: 1.5, fullyBench: 1 },
      { primarySkill: 'React', headcount: 2, availableFte: 0, fullyBench: 0 },
      { primarySkill: 'Go', headcount: 1, availableFte: 1, fullyBench: 1 },
      { primarySkill: null, headcount: 1, availableFte: 0, fullyBench: 0 },
    ]);
  });

  it('min_free changes availableFte only', async () => {
    const d = (await get('capacity', '?min_free=60')).body.data;
    expect(d.bench.availableFte).toBe(2);
    expect(d.bench.partiallyAvailable).toBe(1);
  });

  it('shadow allocation uses capacity but is not billable', async () => {
    const d = (await get('capacity')).body.data;
    // r4: 80 billable + 20 shadow = fully allocated; r5: 100 shadow = shadow-only and fully allocated.
    expect(d.bench.shadowOnly).toBe(1);
    expect(d.allocation.shadowPct).toBe(15);
  });
});

describe('pipeline (stages, mapping, fulfilment)', () => {
  it('reports open requirements by stage with every mapping status', async () => {
    const d = (await get('pipeline')).body.data;
    expect(d.byStage.map((s: Json) => s.stage)).toEqual(['requirement', 'qualification', 'budgeting', 'candidate_mapping', 'interview', 'agreement']);
    const by = Object.fromEntries(d.byStage.map((s: Json) => [s.stage, s]));
    expect(by.requirement).toMatchObject({ requirements: 1, positions: 1 });
    expect(by.qualification).toMatchObject({ requirements: 0, positions: 0 });
    expect(by.interview).toMatchObject({ requirements: 1, positions: 3 });
    expect(by.interview.mappedCandidates).toEqual({
      mapped: 0, screening: 0, submitted: 0, interview: 0, selected: 2, offered: 1, joined: 1, rejected: 1, withdrawn: 0,
    });
    expect(by.candidate_mapping.mappedCandidates.mapped).toBe(1);
    expect(by.agreement.mappedCandidates).toMatchObject({ joined: 1, withdrawn: 1 });
  });

  it('keeps capped filled positions apart from uncapped mappings', async () => {
    const o = (await get('pipeline')).body.data.open;
    expect(o).toEqual({
      requirements: 4,
      positions: 8,
      filledPositions: 4, // 3 (capped from 4 on a 3-position requirement) + 1
      unfilledPositions: 4,
      fulfilmentPct: 50,
      mappingsInFilledStatus: 5, // 4 + 1, uncapped
    });
    expect(o.filledPositions).toBeLessThanOrEqual(o.positions);
    expect(o.filledPositions).toBeLessThanOrEqual(o.mappingsInFilledStatus);
  });

  it('includes terminal stages, 90-day closes, holds and follow-ups', async () => {
    const d = (await get('pipeline', '?include_terminal=true')).body.data;
    expect(d.byStage.map((s: Json) => s.stage)).toContain('won');
    expect(d.byStage.find((s: Json) => s.stage === 'won')).toMatchObject({ requirements: 1, positions: 2 });
    expect(d.closedLast90d).toEqual({ won: 1, lost: 0 }); // the loss was 200 days ago
    expect(d.onHold).toBe(1);
    expect(d.followUpsDue).toBe(1);
  });

  it('filters by client and lists open requirements per client', async () => {
    const all = (await get('pipeline')).body.data.byClient;
    expect(all).toEqual([
      { clientId: 1, clientName: 'Acme', openRequirements: 2, openPositions: 5, filledPositions: 4 },
      { clientId: 2, clientName: 'Beta', openRequirements: 1, openPositions: 2, filledPositions: 0 },
    ]); // the prospect requirement has no client and is in the totals only
    const acme = (await get('pipeline', '?client_id=1')).body.data;
    expect(acme.open).toMatchObject({ requirements: 2, positions: 5, filledPositions: 4 });
    const interview = (await get('pipeline', '?stage=interview')).body.data;
    expect(interview.byStage).toHaveLength(1);
    expect(interview.open.requirements).toBe(1);
  });
});

describe('renewals (expiry and exposure)', () => {
  it('counts each agreement chain once, at its current version', async () => {
    const a = (await get('renewals')).body.data.agreements;
    expect(a.items.map((i: Json) => i.title)).toEqual(['Agreement 4', 'Agreement 3', 'Agreement 8']); // lapsed first, by end date
    expect(a.expiring).toBe(2);
    expect(a.lapsed).toBe(1);
    expect(a.items[0]).toMatchObject({ state: 'lapsed', daysToExpiry: -30, currency: 'USD', value: 1000 });
    // AG1 and AG5 end in the window but have successors: covered, not exposure.
    expect(a.alreadyRenewed).toBe(2);
    expect(a.items.map((i: Json) => i.title)).not.toContain('Agreement 1');
    expect(a.items.map((i: Json) => i.title)).not.toContain('Agreement 5');
    expect(a.dataQuality.supersededButActive).toBe(1); // AG5
    expect(a.chainHeads).toBe(5); // AG2, AG3, AG4, AG6, AG8
  });

  it('exposure is contract value per currency by bucket, never summed across versions', async () => {
    const e = (await get('renewals')).body.data.agreements.exposureByBucket;
    expect(e.map((b: Json) => b.bucket)).toEqual(['0-30', '31-60', '61-90', '91+', 'lapsed']);
    const by = Object.fromEntries(e.map((b: Json) => [b.bucket, b]));
    expect(by['0-30']).toMatchObject({ count: 0, contractValue: [] });
    expect(money(by['31-60'].contractValue)).toEqual({ INR: 500000 });
    expect(money(by['61-90'].contractValue)).toEqual({ AED: 9000 });
    expect(money(by.lapsed.contractValue)).toEqual({ USD: 1000 });
    // 100000 + 120000 (AG1 + AG2) or 70000 + 75000 (AG5 + AG6) never appear.
    expect(JSON.stringify(e)).not.toMatch(/220000|145000|70000|75000|100000|120000/);
  });

  it('honours the window and lapsed look-back', async () => {
    const narrow = (await get('renewals', '?window_days=30&lapsed_within_days=0')).body.data.agreements;
    expect(narrow.items).toEqual([]); // AG3 is at +40, AG4 lapsed 30 days ago
    expect(narrow.alreadyRenewed).toBe(1); // AG1 only (AG5 ends at +35)
    const wide = (await get('renewals', '?window_days=90&lapsed_within_days=365')).body.data.agreements;
    expect(wide.items.map((i: Json) => i.title)).toContain('Agreement 7'); // lapsed 300 days ago, expired status
  });

  it('reports deployment end dates, open-ended and past-end deployments', async () => {
    const dep = (await get('renewals')).body.data.deployments;
    expect(dep.endingInWindow).toBe(2); // D1 (+20, INR 100000) and D4 (+70, USD 2000)
    expect(money(dep.monthlyBillingEnding)).toEqual({ INR: 100000, USD: 2000 });
    expect(dep.openEnded).toBe(4); // D2, D3, D6, D9
    expect(dep.byBucket.map((b: Json) => b.bucket)).toEqual(['past_end_date', '0-30', '61-90']);
    expect(dep.byBucket[0]).toMatchObject({ count: 1 }); // D7, a shadow deployment past its end date
  });

  it('filters by client', async () => {
    const a = (await get('renewals', '?client_id=2')).body.data.agreements;
    expect(a.items.map((i: Json) => i.title)).toEqual(['Agreement 3']);
  });
});

/* ── Read-only, audit and failure behaviour ───────────────────── */

describe('no business writes', () => {
  it('leaves every business table untouched across all endpoints, filters and error paths', async () => {
    const before = await snapshot(fx.client, ['reporting_audit_log']);
    const t = await newToken();
    for (const scope of ALL) {
      await get(scope, '', t.token);
      await get(scope, '?limit=1&offset=1', t.token);
      await get(scope, '?bogus=1', t.token);
    }
    await get('invoices', '?client_id=1&currency=INR', t.token);
    await get('renewals', '?window_days=365&lapsed_within_days=365', t.token);
    const after = await snapshot(fx.client, ['reporting_audit_log']);
    expect(after).toEqual(before);
  });

  it('does not expire an active agreement whose end date has passed (no hidden sync)', async () => {
    await get('renewals');
    await get('invoices');
    const row = (await fx.client.execute('SELECT status FROM agreements WHERE id = 4')).rows[0];
    expect(row.status).toBe('active'); // AG4 ended 30 days ago; only the dashboard route's sync would change it
  });
});

describe('audit', () => {
  it('writes exactly one row per authenticated request, with ids and counts only', async () => {
    const t = await newToken();
    const count = async () => Number((await fx.client.execute({ sql: 'SELECT count(*) c FROM reporting_audit_log WHERE token_id = ?', args: [t.id] })).rows[0].c);
    expect(await count()).toBe(0);
    await get('billing', '?limit=3', t.token);
    await get('invoices', '?bogus=1', t.token); // 422 is audited too
    expect(await count()).toBe(2);
    // Unauthenticated requests never reach the table (the gate and the handler's own check log instead).
    await billingGET(new Request('http://localhost/api/reporting/v1/billing'));
    expect(await count()).toBe(2);

    const rows = (await fx.client.execute({ sql: 'SELECT * FROM reporting_audit_log WHERE token_id = ? ORDER BY id', args: [t.id] })).rows;
    expect(rows[0]).toMatchObject({ endpoint: 'billing', status: 200, result_code: 'ok', params_json: '{"limit":3,"offset":0}' });
    expect(rows[1]).toMatchObject({ endpoint: 'invoices', status: 422, result_code: 'invalid_parameter' });
    const text = JSON.stringify(rows);
    expect(text).not.toContain(t.token);
    expect(text).not.toMatch(/bearer|authorization|cookie/i);
    for (const s of SENTINELS) expect(text).not.toContain(s);
  });

  it('records a cache hit', async () => {
    const t = await newToken();
    await get('capacity', '?limit=7', t.token);
    await get('capacity', '?limit=7', t.token);
    const hits = (await fx.client.execute({ sql: 'SELECT cache_hit FROM reporting_audit_log WHERE token_id = ? ORDER BY id', args: [t.id] })).rows.map((r) => Number(r.cache_hit));
    expect(hits).toEqual([0, 1]);
  });

  it('fails closed when the audit row cannot be written, and serves nothing', async () => {
    const t = await newToken();
    await fx.client.execute('ALTER TABLE reporting_audit_log RENAME TO reporting_audit_log_away');
    try {
      const res = await get('capacity', '?limit=11', t.token);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('audit_unavailable');
      expect(res.body.data).toBeUndefined();
      const logged = vi.mocked(console.error).mock.calls.map((c) => String(c[0])).join('\n');
      expect(logged).toContain('reporting_audit_write_failed');
    } finally {
      await fx.client.execute('ALTER TABLE reporting_audit_log_away RENAME TO reporting_audit_log');
    }
  });
});

describe('the read-only database client', () => {
  it('refuses a remote database without a read-only token', () => {
    resetReportingDbForTests();
    expect(() => getReportingDb({ TURSO_DATABASE_URL: 'libsql://example.invalid', TURSO_AUTH_TOKEN: 'writable' })).toThrow(ReportingConfigError);
  });

  it('the writable-token escape hatch is explicit and warns', () => {
    resetReportingDbForTests();
    const warn = vi.mocked(console.warn);
    warn.mockClear();
    expect(() =>
      getReportingDb({ TURSO_DATABASE_URL: 'libsql://example.invalid', TURSO_AUTH_TOKEN: 'writable', REPORTING_ALLOW_WRITABLE_DB: 'true' }),
    ).not.toThrow();
    expect(warn.mock.calls.map((c) => String(c[0])).join('')).toContain('reporting_writable_db_allowed');
    resetReportingDbForTests();
    process.env.TURSO_DATABASE_URL = fx.url; // back to the scratch database
  });

  it('answers 503 (not a stack trace) when the remote database has no read-only credential', async () => {
    const t = await newToken();
    const saved = process.env.TURSO_DATABASE_URL;
    process.env.TURSO_DATABASE_URL = 'libsql://example.invalid';
    resetReportingDbForTests();
    try {
      const res = await get('renewals', '?limit=13', t.token);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('data_unavailable');
      expect(JSON.stringify(res.body)).not.toContain('TURSO');
    } finally {
      process.env.TURSO_DATABASE_URL = saved;
      resetReportingDbForTests();
    }
  });
});
