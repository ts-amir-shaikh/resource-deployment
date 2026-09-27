import { describe, expect, it } from 'vitest';
import { checkSession, todayInIndia, withinAccess, type AccountState } from './eligibility';

const account = (over: Partial<AccountState> = {}): AccountState => ({
  active: true,
  sessionVersion: 0,
  accessUntil: null,
  role: 'ta',
  ...over,
});

// 30 Sep 2026 23:59 IST is 18:29 UTC; 1 Oct 00:00 IST is 18:30 UTC on 30 Sep.
const lastMinuteOf30Sep = new Date('2026-09-30T18:29:00Z');
const firstMinuteOf1Oct = new Date('2026-09-30T18:30:00Z');

describe('todayInIndia', () => {
  it('uses India time, not UTC, to decide the date', () => {
    expect(todayInIndia(lastMinuteOf30Sep)).toBe('2026-09-30');
    expect(todayInIndia(firstMinuteOf1Oct)).toBe('2026-10-01');
  });
});

describe('withinAccess (R5)', () => {
  it('no end date means no end', () => {
    expect(withinAccess(null, firstMinuteOf1Oct)).toBe(true);
  });

  it('Covers AE2. the access-until date is the last day that works, inclusive', () => {
    expect(withinAccess('2026-09-30', lastMinuteOf30Sep)).toBe(true);
    expect(withinAccess('2026-09-30', firstMinuteOf1Oct)).toBe(false);
  });
});

describe('checkSession (R16)', () => {
  const now = lastMinuteOf30Sep;

  it('an active account at the token version with no end date is current', () => {
    expect(checkSession({ role: 'ta', sv: 0 }, account(), now)).toBe('ok');
  });

  it('no account row signs out', () => {
    expect(checkSession({ role: 'ta', sv: 0 }, null, now)).toBe('signout');
  });

  it('an inactive account signs out', () => {
    expect(checkSession({ role: 'ta', sv: 0 }, account({ active: false }), now)).toBe('signout');
  });

  it('Covers AE2. an account past its access-until date signs out', () => {
    expect(
      checkSession({ role: 'interviewer', sv: 0 }, account({ role: 'interviewer', accessUntil: '2026-09-30' }), firstMinuteOf1Oct),
    ).toBe('signout');
  });

  it('a token from before versions existed matches an account at version 0', () => {
    expect(checkSession({ role: 'ta', sv: 0 }, account({ sessionVersion: 0 }), now)).toBe('ok');
  });

  it('a stale version on a usable account asks for a fresh session', () => {
    expect(checkSession({ role: 'ta', sv: 2 }, account({ sessionVersion: 3 }), now)).toBe('refresh');
  });

  it('a stale version on an inactive account signs out rather than refreshing', () => {
    expect(checkSession({ role: 'ta', sv: 2 }, account({ sessionVersion: 3, active: false }), now)).toBe('signout');
  });

  it('Covers AE6. a role that no longer matches asks for a fresh session even at the same version', () => {
    expect(checkSession({ role: 'ta', sv: 1 }, account({ role: 'sales', sessionVersion: 1 }), now)).toBe('refresh');
  });
});
