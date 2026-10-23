import { describe, expect, it } from 'vitest';
import { canMove, countsAsLeave, expandLeave, leaveDays, rangesOverlap } from './leave-rules';

const NONE = new Set<string>();

describe('expandLeave', () => {
  it('counts working days only, skipping a weekend inside the range', () => {
    // Thu 22 Oct to Tue 27 Oct 2026: Thu, Fri, Mon, Tue.
    const days = expandLeave({ startDate: '2026-10-22', endDate: '2026-10-27', halfDay: false }, NONE);
    expect(days.map((d) => d.date)).toEqual(['2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27']);
    expect(days.every((d) => d.fraction === 1)).toBe(true);
  });

  it('does not charge a holiday inside the range', () => {
    expect(leaveDays({ startDate: '2026-10-19', endDate: '2026-10-21', halfDay: false }, new Set(['2026-10-20']))).toBe(2);
  });

  it('a half day is one working day at 0.5', () => {
    expect(leaveDays({ startDate: '2026-10-22', endDate: '2026-10-22', halfDay: true }, NONE)).toBe(0.5);
  });

  it('is nothing when the range is only a weekend or a holiday', () => {
    expect(leaveDays({ startDate: '2026-10-24', endDate: '2026-10-25', halfDay: false }, NONE)).toBe(0);
    expect(leaveDays({ startDate: '2026-10-20', endDate: '2026-10-20', halfDay: false }, new Set(['2026-10-20']))).toBe(0);
  });
});

describe('rangesOverlap', () => {
  it('touching days overlap, adjacent ranges do not', () => {
    expect(rangesOverlap({ startDate: '2026-10-01', endDate: '2026-10-05' }, { startDate: '2026-10-05', endDate: '2026-10-09' })).toBe(true);
    expect(rangesOverlap({ startDate: '2026-10-01', endDate: '2026-10-05' }, { startDate: '2026-10-06', endDate: '2026-10-09' })).toBe(false);
  });
});

describe('status', () => {
  it('only a pending request moves', () => {
    expect(canMove('pending', 'approved')).toBe(true);
    expect(canMove('pending', 'rejected')).toBe(true);
    expect(canMove('pending', 'cancelled')).toBe(true);
    expect(canMove('approved', 'rejected')).toBe(false);
    expect(canMove('rejected', 'approved')).toBe(false);
    expect(canMove('pending', 'pending')).toBe(false);
  });
  it('only approved leave counts', () => {
    expect(countsAsLeave('approved')).toBe(true);
    expect(countsAsLeave('pending')).toBe(false);
  });
});
