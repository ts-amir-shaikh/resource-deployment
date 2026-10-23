import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  dayRowsFromGrid,
  daySignature,
  dayStatus,
  dayTone,
  expectedHours,
  gridDayRowCount,
  gridDayTotal,
  isoWeekNumber,
  monthBounds,
  monthChoices,
  monthsIn,
  parseHours,
  savedDayRows,
  weeksOfMonth,
  type SavedEntry,
} from './timesheet-week';

const e = (entryType: SavedEntry['entryType'], hours: number, task: string | null = null, taskKind: SavedEntry['taskKind'] = null): SavedEntry => ({
  entryDate: '2026-10-22', entryType, hours, task, taskKind,
});

const LABEL = 'No client tasks assigned';

describe('buildGrid / dayRowsFromGrid', () => {
  it('starts empty: a person adds the tasks they worked on', () => {
    expect(buildGrid([], LABEL)).toEqual([]);
  });

  it('groups work by task name, and shows the fixed task under its own name', () => {
    const saved = [e('work', 8, 'TA:12344'), { ...e('work', 3.25, 'TA:12344'), entryDate: '2026-10-23' }, { ...e('work', 8, null, 'no_client_tasks'), entryDate: '2026-10-21' }];
    const g = buildGrid(saved, LABEL);
    expect(g.map((r) => r.label)).toEqual(['TA:12344', LABEL]);
    expect(g[0].cells).toEqual({ '2026-10-22': '8', '2026-10-23': '3.25' });
  });

  it('round-trips a split day unchanged', () => {
    const saved = [e('work', 4, 'Build'), e('work', 4, null, 'no_client_tasks')];
    const g = buildGrid(saved, LABEL);
    expect(gridDayTotal(g, '2026-10-22')).toBe(8);
    expect(gridDayRowCount(g, '2026-10-22')).toBe(2);
    expect(daySignature(dayRowsFromGrid(g, '2026-10-22', saved, LABEL))).toBe(daySignature(savedDayRows(saved, '2026-10-22')));
  });

  it('stores the fixed task as a kind, whatever the capitals, never as text', () => {
    const g = [{ key: 'a', label: ' no client tasks ASSIGNED ', cells: { '2026-10-22': '8' } }];
    expect(dayRowsFromGrid(g, '2026-10-22', [], LABEL)).toEqual([{ entryType: 'work', hours: 8, taskKind: 'no_client_tasks' }]);
  });

  it('ignores empty and zero boxes, and a row with no name stores work with no task', () => {
    const g = [{ key: 'a', label: '', cells: { '2026-10-22': '0', '2026-10-23': '5' } }];
    expect(dayRowsFromGrid(g, '2026-10-22', [], LABEL)).toEqual([]);
    expect(dayRowsFromGrid(g, '2026-10-23', [], LABEL)).toEqual([{ entryType: 'work', hours: 5 }]);
  });

  it('keeps leave rows saved before leave moved, so editing work cannot delete them', () => {
    const saved = [e('work', 4, 'Build'), e('paid_leave', 4)];
    expect(dayRowsFromGrid(buildGrid(saved, LABEL), '2026-10-22', saved, LABEL)).toContainEqual({ entryType: 'paid_leave', hours: 4 });
  });

  it('keeps a holiday row while there is no work, and drops it once there is', () => {
    const saved = [e('holiday', 0, 'Dussehra')];
    expect(dayRowsFromGrid([], '2026-10-22', saved, LABEL)).toEqual([{ entryType: 'holiday', hours: 0, task: 'Dussehra' }]);
    const g = [{ key: 'a', label: 'Build', cells: { '2026-10-22': '8' } }];
    expect(dayRowsFromGrid(g, '2026-10-22', saved, LABEL)).toEqual([{ entryType: 'work', hours: 8, task: 'Build' }]);
  });
});

describe('dayTone', () => {
  const base = { holiday: false, weekend: false, today: '2026-10-23' };
  it('is green at exactly what was expected, red short or over', () => {
    expect(dayTone({ ...base, worked: 8, expected: 8, date: '2026-10-19' })).toBe('ok');
    expect(dayTone({ ...base, worked: 3.25, expected: 8, date: '2026-10-22' })).toBe('short');
    expect(dayTone({ ...base, worked: 9, expected: 8, date: '2026-10-22' })).toBe('over');
  });
  it('an empty day not yet come is waiting; a past one is short', () => {
    expect(dayTone({ ...base, worked: 0, expected: 8, date: '2026-10-23' })).toBe('wait');
    expect(dayTone({ ...base, worked: 0, expected: 8, date: '2026-10-21' })).toBe('short');
  });
  it('a holiday, a whole day of leave and a weekend are not measured', () => {
    expect(dayTone({ ...base, worked: 0, expected: 8, date: '2026-10-20', holiday: true })).toBe('holiday');
    expect(dayTone({ ...base, worked: 0, expected: 0, date: '2026-10-21' })).toBe('leave');
    expect(dayTone({ ...base, worked: 0, expected: 8, date: '2026-10-24', weekend: true })).toBe('rest');
  });
  it('half a day of leave halves what is expected', () => {
    expect(expectedHours(8, 4)).toBe(4);
    expect(dayTone({ ...base, worked: 4, expected: expectedHours(8, 4), date: '2026-10-21' })).toBe('ok');
    expect(expectedHours(8, 12)).toBe(0);
  });
});

describe('parseHours / dayStatus', () => {
  it('reads empty as 0 and refuses nonsense', () => {
    expect(parseHours('')).toBe(0);
    expect(parseHours('3.25')).toBe(3.25);
    expect(parseHours('abc')).toBeNull();
    expect(parseHours('-1')).toBeNull();
  });
  it('picks the status that needs attention', () => {
    expect(dayStatus(['approved', 'rejected'])).toBe('rejected');
    expect(dayStatus([])).toBeNull();
  });
});

describe('weeks and months', () => {
  it('numbers ISO weeks', () => {
    expect(isoWeekNumber('2026-10-19')).toBe(43);
    expect(isoWeekNumber('2026-01-01')).toBe(1);
    expect(isoWeekNumber('2026-12-31')).toBe(53);
  });

  it('splits a month into its weeks, the first and last cut at the month edge', () => {
    const w = weeksOfMonth('2026-10');
    expect(w[0].dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(w[0].week).toBe('2026-09-28');
    expect(w.at(-1)!.dates).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(w.reduce((s, x) => s + x.dates.length, 0)).toBe(31);
  });

  it('a week across two months is one piece in each', () => {
    expect(weeksOfMonth('2026-09').at(-1)!.dates).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    expect(weeksOfMonth('2026-10')[0].week).toBe('2026-09-28');
  });

  it('bounds, months in a run, and the choices offered', () => {
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthsIn(['2026-09-30', '2026-10-01'])).toEqual(['2026-09', '2026-10']);
    expect(monthChoices('2026-08-10', null, '2026-10-23')).toEqual(['2026-11', '2026-10', '2026-09', '2026-08']);
    expect(monthChoices('2026-08-10', '2026-09-15', '2026-10-23')).toEqual(['2026-09', '2026-08']);
  });
});
