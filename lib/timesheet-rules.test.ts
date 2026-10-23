import { describe, expect, it } from 'vitest';
import {
  coverageLabel,
  datesBetween,
  dayHours,
  dayValue,
  effectiveVersion,
  isEditable,
  isExpectedDay,
  periodKey,
  periodSummary,
  weekDates,
  weekStart,
  type SummaryEntry,
} from './timesheet-rules';

const NONE = new Set<string>();

describe('effectiveVersion (D10)', () => {
  it('uses the deployment setting when there is one', () => {
    expect(effectiveVersion('v2', 'v1')).toBe('v2');
    expect(effectiveVersion('v1', 'v2')).toBe('v1');
  });

  it('falls back to the project default, then to v1', () => {
    expect(effectiveVersion(null, 'v2')).toBe('v2');
    expect(effectiveVersion(null, null)).toBe('v1');
    expect(effectiveVersion('nonsense', undefined)).toBe('v1');
  });
});

describe('dayValue: hours to days (D9, AE2)', () => {
  const work = (hours: number) => ({ entryType: 'work' as const, hours });

  it('8 hours on an 8-hour day is a full day', () => {
    expect(dayValue([work(8)], 8, true)).toEqual({ holiday: false, worked: 1, paidLeave: 0, unpaidLeave: 0 });
  });

  it('caps a long day at one', () => {
    expect(dayValue([work(10)], 8, true).worked).toBe(1);
  });

  it('4 hours is half a day, and the other half is unpaid (Q2)', () => {
    expect(dayValue([work(4)], 8, true)).toEqual({ holiday: false, worked: 0.5, paidLeave: 0, unpaidLeave: 0.5 });
  });

  it('6 hours rounds to a full day (Q1: nearest half)', () => {
    expect(dayValue([work(6)], 8, true).worked).toBe(1);
  });

  it('1 hour rounds to nothing, leaving the day unpaid', () => {
    expect(dayValue([work(1)], 8, true)).toMatchObject({ worked: 0, unpaidLeave: 1 });
  });

  it('sums task rows for version 2 (D11)', () => {
    expect(dayValue([work(3), work(3), work(2)], 8, true).worked).toBe(1);
  });

  it('respects a deployment with a different full day', () => {
    expect(dayValue([work(4.5)], 9, true).worked).toBe(0.5);
  });

  it('half work and half paid leave bills in full', () => {
    expect(dayValue([work(4), { entryType: 'paid_leave', hours: 4 }], 8, true)).toEqual({
      holiday: false,
      worked: 0.5,
      paidLeave: 0.5,
      unpaidLeave: 0,
    });
  });

  it('a full day of paid leave', () => {
    expect(dayValue([{ entryType: 'paid_leave', hours: 8 }], 8, true)).toMatchObject({ paidLeave: 1, unpaidLeave: 0 });
  });

  it('a full day of unpaid leave', () => {
    expect(dayValue([{ entryType: 'unpaid_leave', hours: 8 }], 8, true)).toMatchObject({ worked: 0, unpaidLeave: 1 });
  });

  it('paid leave never pushes the day past one', () => {
    expect(dayValue([work(8), { entryType: 'paid_leave', hours: 8 }], 8, true)).toMatchObject({ worked: 1, paidLeave: 0 });
  });

  it('a holiday is neither work nor leave', () => {
    expect(dayValue([{ entryType: 'holiday', hours: 0 }], 8, true)).toEqual({
      holiday: true,
      worked: 0,
      paidLeave: 0,
      unpaidLeave: 0,
    });
  });

  it('a weekend carries no shortfall', () => {
    expect(dayValue([work(2)], 8, false)).toEqual({ holiday: false, worked: 0.5, paidLeave: 0, unpaidLeave: 0 });
  });

  it('ignores negative hours and a zero full day', () => {
    expect(dayValue([work(-4)], 8, true).worked).toBe(0);
    expect(dayValue([work(8)], 0, true).worked).toBe(1);
  });
});

describe('dayHours', () => {
  it('totals the rows', () => {
    expect(dayHours([{ entryType: 'work', hours: 2.5 }, { entryType: 'work', hours: 3 }])).toBe(5.5);
  });
});

describe('lifecycle', () => {
  it('only draft and rejected entries are editable', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('rejected')).toBe(true);
    expect(isEditable('submitted')).toBe(false);
    expect(isEditable('approved')).toBe(false);
  });
});

describe('dates', () => {
  it('weeks run Monday to Sunday', () => {
    // 2026-03-04 is a Wednesday.
    expect(weekStart('2026-03-04')).toBe('2026-03-02');
    expect(weekStart('2026-03-08')).toBe('2026-03-02');
    expect(weekStart('2026-03-02')).toBe('2026-03-02');
    expect(weekDates('2026-03-04')).toEqual([
      '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08',
    ]);
  });

  it('lists a range inclusively, across a month end', () => {
    expect(datesBetween('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(datesBetween('2026-03-02', '2026-03-01')).toEqual([]);
  });

  it('expects weekdays that are not holidays', () => {
    expect(isExpectedDay('2026-03-02', NONE)).toBe(true);
    expect(isExpectedDay('2026-03-07', NONE)).toBe(false);
    expect(isExpectedDay('2026-03-08', NONE)).toBe(false);
    expect(isExpectedDay('2026-03-02', new Set(['2026-03-02']))).toBe(false);
  });

  it('groups the approval queue by cadence', () => {
    expect(periodKey('2026-03-04', 'daily')).toBe('2026-03-04');
    expect(periodKey('2026-03-04', 'weekly')).toBe('2026-03-02');
    expect(periodKey('2026-03-04', 'monthly')).toBe('2026-03');
  });
});

describe('periodSummary: the invoice feed (G-RES-04)', () => {
  // March 2026 has 22 weekdays.
  const MARCH = { from: '2026-03-01', to: '2026-03-31', fullDayHours: 8 };

  function fullMonth(status: SummaryEntry['status'] = 'approved', unpaid: string[] = []): SummaryEntry[] {
    return datesBetween(MARCH.from, MARCH.to)
      .filter((d) => isExpectedDay(d, NONE))
      .map((entryDate) => ({
        entryDate,
        status,
        entryType: unpaid.includes(entryDate) ? ('unpaid_leave' as const) : ('work' as const),
        hours: 8,
      }));
  }

  it('a fully approved month is complete, with its unpaid leave (AE5)', () => {
    const s = periodSummary([{ ...MARCH, entries: fullMonth('approved', ['2026-03-10', '2026-03-11']) }], NONE);
    expect(s).toEqual({
      expectedDays: 22,
      approvedDays: 22,
      workedDays: 20,
      paidLeaveDays: 0,
      unpaidLeaveDays: 2,
      complete: true,
    });
  });

  it('half a month approved is not complete (AE6)', () => {
    const entries = fullMonth().filter((e) => e.entryDate <= '2026-03-16');
    const s = periodSummary([{ ...MARCH, entries }], NONE);
    expect(s.expectedDays).toBe(22);
    expect(s.approvedDays).toBe(11);
    expect(s.complete).toBe(false);
    expect(coverageLabel(s)).toBe('11 of 22 days approved');
  });

  it('submitted days do not count', () => {
    const s = periodSummary([{ ...MARCH, entries: fullMonth('submitted') }], NONE);
    expect(s.approvedDays).toBe(0);
    expect(s.complete).toBe(false);
  });

  it('a day with any unapproved row is not approved', () => {
    const entries: SummaryEntry[] = [
      { entryDate: '2026-03-02', status: 'approved', entryType: 'work', hours: 4 },
      { entryDate: '2026-03-02', status: 'rejected', entryType: 'work', hours: 4 },
    ];
    expect(periodSummary([{ ...MARCH, entries }], NONE).approvedDays).toBe(0);
  });

  it('holidays are not expected, and a short day counts its shortfall as unpaid', () => {
    const holidays = new Set(['2026-03-31']);
    const entries = fullMonth().filter((e) => e.entryDate !== '2026-03-31');
    entries[0] = { ...entries[0], hours: 4 };
    const s = periodSummary([{ ...MARCH, entries }], holidays);
    expect(s.expectedDays).toBe(21);
    expect(s.complete).toBe(true);
    expect(s.unpaidLeaveDays).toBe(0.5);
    expect(s.workedDays).toBe(20.5);
  });

  it('only counts the deployment window, and adds windows together', () => {
    const entries = fullMonth();
    const first = { from: '2026-03-01', to: '2026-03-13', fullDayHours: 8, entries };
    const second = { from: '2026-03-16', to: '2026-03-31', fullDayHours: 8, entries };
    const s = periodSummary([first, second], NONE);
    expect(s.expectedDays).toBe(22);
    expect(s.approvedDays).toBe(22);
  });

  it('an empty window is never complete', () => {
    const s = periodSummary([{ from: '2026-03-07', to: '2026-03-08', fullDayHours: 8, entries: [] }], NONE);
    expect(s.expectedDays).toBe(0);
    expect(s.complete).toBe(false);
  });
});

describe('leave from requests priced by the invoice feed (FSD-21)', () => {
  const leave = (entryDate: string, entryType: 'paid_leave' | 'unpaid_leave', hours: number): SummaryEntry => ({
    entryDate, entryType, hours, status: 'approved',
  });

  it('a whole approved leave day is approved on its own and prices as leave', () => {
    const s = periodSummary([{ from: '2026-10-22', to: '2026-10-22', fullDayHours: 8, entries: [leave('2026-10-22', 'unpaid_leave', 8)] }], NONE);
    expect(s.approvedDays).toBe(1);
    expect(s.unpaidLeaveDays).toBe(1);
    expect(s.workedDays).toBe(0);
  });

  it('a half day of paid leave beside half a day of work is a full, billed day', () => {
    const rows: SummaryEntry[] = [
      leave('2026-10-22', 'paid_leave', 4),
      { entryDate: '2026-10-22', entryType: 'work', hours: 4, status: 'approved' },
    ];
    const s = periodSummary([{ from: '2026-10-22', to: '2026-10-22', fullDayHours: 8, entries: rows }], NONE);
    expect(s.workedDays).toBe(0.5);
    expect(s.paidLeaveDays).toBe(0.5);
    expect(s.unpaidLeaveDays).toBe(0);
  });

  it('half a day of leave with no work leaves the other half unpaid, as a short day always does', () => {
    const s = periodSummary([{ from: '2026-10-22', to: '2026-10-22', fullDayHours: 8, entries: [leave('2026-10-22', 'paid_leave', 4)] }], NONE);
    expect(s.paidLeaveDays).toBe(0.5);
    expect(s.unpaidLeaveDays).toBe(0.5);
  });
});
