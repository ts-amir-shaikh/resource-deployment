import { describe, expect, it } from 'vitest';
import { AGING_BUCKETS, bucketFor, daysPastDue } from './aging';
import { computeCapacity } from './capacity';
import { foldOpen } from './pipeline';
import { agreementBucket } from './renewals';
import { paginate } from './paginate';

describe('aging buckets (days past due, Asia/Kolkata as-of)', () => {
  const asOf = '2026-11-23';
  it.each([
    ['2026-11-24', 'notYetDue'], // due tomorrow
    ['2026-11-23', 'notYetDue'], // due today is not yet overdue
    ['2026-11-22', 'd1_30'], // 1 day
    ['2026-10-24', 'd1_30'], // 30 days
    ['2026-10-23', 'd31_60'], // 31
    ['2026-09-24', 'd31_60'], // 60
    ['2026-09-23', 'd61_90'], // 61
    ['2026-08-25', 'd61_90'], // 90
    ['2026-08-24', 'd90plus'], // 91
    ['2020-01-01', 'd90plus'],
  ])('due %s → %s', (due, bucket) => {
    expect(bucketFor(due, asOf)).toBe(bucket);
  });

  it('no due date is its own bucket', () => {
    expect(bucketFor(null, asOf)).toBe('noDueDate');
    expect(daysPastDue(null, asOf)).toBeNull();
    expect(AGING_BUCKETS).toHaveLength(6);
  });

  it('the as-of date moves the answer by exactly a day', () => {
    expect(bucketFor('2026-11-23', '2026-11-23')).toBe('notYetDue');
    expect(bucketFor('2026-11-23', '2026-11-24')).toBe('d1_30');
  });
});

describe('capacity maths', () => {
  const r = (id: number, billable: number, shadow: number, skill: string | null = 'X') => ({ id, skill, billable, shadow });

  it('classifies bench from allocation', () => {
    const c = computeCapacity([r(1, 0, 0), r(2, 60, 0), r(3, 100, 0), r(4, 0, 100), r(5, 70, 30)], 1);
    expect(c.headcount).toBe(5);
    expect(c.bench).toEqual({ fullyBench: 1, partiallyAvailable: 1, fullyAllocated: 3, shadowOnly: 1, availableFte: 1.4 });
    expect(c.allocation).toEqual({ billablePct: 46, shadowPct: 26, freePct: 28 });
    expect(c.utilisationPct).toBe(46);
  });

  it('clamps bad data: free capacity never negative, utilisation never above 100', () => {
    const c = computeCapacity([r(1, 80, 80), r(2, 150, 0)], 1);
    expect(c.allocation.freePct).toBe(0);
    expect(c.allocation.billablePct).toBe(90); // 80 and clamped 100
    expect(c.allocation.shadowPct).toBe(10); // second billable clamp leaves no room; first gets 20
  });

  it('min_free only decides what counts as available capacity', () => {
    const rows = [r(1, 70, 0), r(2, 90, 0)];
    expect(computeCapacity(rows, 1).bench.availableFte).toBe(0.4);
    expect(computeCapacity(rows, 20).bench.availableFte).toBe(0.3);
    expect(computeCapacity(rows, 20).bench.partiallyAvailable).toBe(2);
  });

  it('an empty population is zeroes, not NaN', () => {
    const c = computeCapacity([], 1);
    expect(c.headcount).toBe(0);
    expect(c.allocation).toEqual({ billablePct: 0, shadowPct: 0, freePct: 0 });
    expect(c.bySkillAll).toEqual([]);
  });

  it('groups by skill, blank skills together, largest first', () => {
    const c = computeCapacity([r(1, 0, 0, 'A'), r(2, 0, 0, 'A'), r(3, 100, 0, 'B'), r(4, 0, 0, ''), r(5, 0, 0, null)], 1);
    // Largest group first; on a tie the named skill comes before the blank one.
    expect(c.bySkillAll.map((s) => [s.primarySkill, s.headcount])).toEqual([['A', 2], [null, 2], ['B', 1]]);
  });
});

describe('fulfilment: capped versus uncapped', () => {
  it('caps each requirement at its own required positions', () => {
    const f = foldOpen([
      { id: 1, required: 3, clientId: 1, filled: 4 }, // over-filled
      { id: 2, required: 2, clientId: 1, filled: 0 },
      { id: 3, required: 2, clientId: 2, filled: 2 },
    ]);
    expect(f.positions).toBe(7);
    expect(f.mappingsInFilledStatus).toBe(6); // uncapped
    expect(f.filledPositions).toBe(5); // 3 + 0 + 2
    expect(f.unfilledPositions).toBe(2);
    expect(f.fulfilmentPct).toBe(71.4);
    expect(f.filledPositions).toBeLessThanOrEqual(f.mappingsInFilledStatus);
    expect(f.filledPositions).toBeLessThanOrEqual(f.positions);
  });

  it('one over-filled requirement cannot hide an unfilled one', () => {
    const f = foldOpen([
      { id: 1, required: 1, clientId: null, filled: 5 },
      { id: 2, required: 1, clientId: null, filled: 0 },
    ]);
    expect(f.mappingsInFilledStatus).toBe(5);
    expect(f.filledPositions).toBe(1);
    expect(f.fulfilmentPct).toBe(50);
  });

  it('no open positions has no percentage', () => {
    expect(foldOpen([]).fulfilmentPct).toBeNull();
  });
});

describe('agreement expiry buckets', () => {
  it.each([
    [-1, 'lapsed'], [0, '0-30'], [30, '0-30'], [31, '31-60'], [60, '31-60'], [61, '61-90'], [90, '61-90'], [91, '91+'], [365, '91+'],
  ])('%d days → %s', (days, bucket) => {
    expect(agreementBucket(days)).toBe(bucket);
  });
});

describe('pagination', () => {
  const items = [1, 2, 3, 4, 5];
  it('reports total and truncation', () => {
    expect(paginate(items, 2, 0)).toEqual({ page: [1, 2], pagination: { limit: 2, offset: 0, total: 5, truncated: true } });
    expect(paginate(items, 2, 4)).toEqual({ page: [5], pagination: { limit: 2, offset: 4, total: 5, truncated: false } });
    expect(paginate(items, 2, 10).page).toEqual([]);
  });
});
