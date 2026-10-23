import { describe, expect, it } from 'vitest';
import {
  bucketHours,
  deploymentStats,
  overAllocated,
  resourceCapacityHours,
  resourceStats,
  utilisation,
  type DashDeployment,
  type DashEntry,
} from './timesheet-dashboard-rules';
import { defaultHoursPerDay, periodSummary, type SummaryEntry } from './timesheet-rules';

// October 2026 has 22 weekdays (Thu 1 Oct … Fri 30 Oct).
const FROM = '2026-10-01';
const TO = '2026-10-31';
const NONE = new Set<string>();

function dep(over: Partial<DashDeployment> = {}): DashDeployment {
  return {
    id: 1,
    resourceId: 10,
    billable: true,
    fullDayHours: 8,
    startDate: '2026-01-01',
    endDate: null,
    holidays: NONE,
    ...over,
  };
}

/** `n` approved work rows of `hours` each, on the first n weekdays of the month. */
function work(deploymentId: number, total: number, over: Partial<DashEntry> = {}): DashEntry[] {
  return [
    {
      deploymentId,
      entryDate: '2026-10-05',
      entryType: 'work',
      hours: total,
      taskKind: null,
      status: 'approved',
      ...over,
    },
  ];
}

describe('defaultHoursPerDay (D18)', () => {
  it('scales the standard day by allocation, to the half hour', () => {
    expect(defaultHoursPerDay(100)).toBe(8);
    expect(defaultHoursPerDay(50)).toBe(4);
    expect(defaultHoursPerDay(25)).toBe(2);
    expect(defaultHoursPerDay(60)).toBe(5); // 4.8 → 5
  });

  it('never returns less than half an hour or more than a day can hold', () => {
    expect(defaultHoursPerDay(1)).toBe(0.5);
    expect(defaultHoursPerDay(1000)).toBe(24);
    expect(defaultHoursPerDay(0)).toBe(8);
    expect(defaultHoursPerDay(Number.NaN)).toBe(8);
  });
});

describe('utilisation', () => {
  it('is a percentage to one decimal', () => {
    expect(utilisation(120, 176)).toBe(68.2);
  });

  it('is null, never 0, when there is no capacity (AE3)', () => {
    expect(utilisation(0, 0)).toBeNull();
    expect(utilisation(40, 0)).toBeNull();
  });

  it('is a real 0 when there is capacity and no work', () => {
    expect(utilisation(0, 176)).toBe(0);
  });
});

describe('capacity (BR-TSH-09)', () => {
  it('is expected days × the standard day, whatever the deployments are', () => {
    expect(resourceCapacityHours([dep()], FROM, TO)).toBe(176);
    expect(resourceCapacityHours([dep({ id: 2, fullDayHours: 4 }), dep({ id: 3, fullDayHours: 4 })], FROM, TO)).toBe(176);
  });

  it('does not count a day twice when deployments overlap', () => {
    expect(resourceCapacityHours([dep(), dep({ id: 2 })], FROM, TO)).toBe(176);
  });

  it('leaves out days before the person joined', () => {
    // Starts Mon 19 Oct: 19–23 and 26–30 = 10 days.
    expect(resourceCapacityHours([dep({ startDate: '2026-10-19' })], FROM, TO)).toBe(80);
  });

  it('is zero when the whole window is holidays', () => {
    const all = new Set<string>();
    for (let d = 1; d <= 31; d++) all.add(`2026-10-${String(d).padStart(2, '0')}`);
    expect(resourceCapacityHours([dep({ holidays: all })], FROM, TO)).toBe(0);
  });
});

describe('resourceStats', () => {
  it('AE1: 120 approved hours of 176 is 68.2%, 56 hours remain, pending stays beside', () => {
    const entries = [...work(1, 120), ...work(1, 40, { status: 'submitted', entryDate: '2026-10-06' })];
    const s = resourceStats([dep()], entries, FROM, TO);
    expect(s.clientWorkHours).toBe(120);
    expect(s.billableUtilisation).toBe(68.2);
    expect(s.remainingHours).toBe(56);
    expect(s.pendingHours).toBe(40);
  });

  it('AE2: shadow work counts toward total utilisation, not billable', () => {
    const shadow = dep({ id: 2, billable: false });
    const s = resourceStats([dep(), shadow], [...work(1, 100), ...work(2, 16)], FROM, TO);
    expect(s.shadowHours).toBe(16);
    expect(s.billableUtilisation).toBe(56.8);
    expect(s.totalUtilisation).toBe(65.9);
  });

  it('AE3: all-holiday month shows no utilisation', () => {
    const all = new Set<string>();
    for (let d = 1; d <= 31; d++) all.add(`2026-10-${String(d).padStart(2, '0')}`);
    const s = resourceStats([dep({ holidays: all })], [], FROM, TO);
    expect(s.capacityHours).toBe(0);
    expect(s.billableUtilisation).toBeNull();
    expect(s.totalUtilisation).toBeNull();
  });

  it('AE4: a 50% deployment is measured against its own hours, the person against a full day', () => {
    const half = dep({ fullDayHours: 4 });
    const entries = work(1, 80);
    expect(deploymentStats(half, entries, FROM, TO).expectedHours).toBe(88);
    expect(deploymentStats(half, entries, FROM, TO).utilisation).toBe(90.9);
    expect(resourceStats([half], entries, FROM, TO).billableUtilisation).toBe(45.5);
  });

  it('AE8: no-client-task hours are billable work, but not task-backed', () => {
    const entries = [...work(1, 100), ...work(1, 8, { taskKind: 'no_client_tasks', entryDate: '2026-10-06' })];
    const s = resourceStats([dep()], entries, FROM, TO);
    expect(s.clientWorkHours).toBe(108);
    expect(s.noClientTaskHours).toBe(8);
    expect(s.billableUtilisation).toBe(61.4);
    expect(s.taskBackedUtilisation).toBe(56.8);
  });

  it('remaining hours never go below zero', () => {
    const s = resourceStats([dep()], work(1, 300), FROM, TO);
    expect(s.remainingHours).toBe(0);
  });

  it('counts only approved time; drafts are not reported at all', () => {
    const entries = work(1, 50, { status: 'draft' });
    const s = resourceStats([dep()], entries, FROM, TO);
    expect(s.clientWorkHours).toBe(0);
    expect(s.pendingHours).toBe(0);
  });

  it('a holiday row on an expected day takes capacity; one on a calendar holiday does not double count', () => {
    const cal = dep({ holidays: new Set(['2026-10-05']) });
    const onCalendar = work(1, 8, { entryType: 'holiday' });
    const offCalendar = work(1, 8, { entryType: 'holiday', entryDate: '2026-10-06' });
    expect(resourceStats([cal], onCalendar, FROM, TO).holidayHours).toBe(0);
    expect(resourceStats([cal], offCalendar, FROM, TO).holidayHours).toBe(8);
  });
});

describe('bucketHours', () => {
  it('rejected time is reported, not counted', () => {
    const b = bucketHours(work(1, 8, { status: 'rejected' }), new Map([[1, dep()]]));
    expect(b.rejectedHours).toBe(8);
    expect(b.clientWorkHours).toBe(0);
  });

  it('ignores entries of deployments it was not given', () => {
    expect(bucketHours(work(99, 8), new Map([[1, dep()]])).clientWorkHours).toBe(0);
  });
});

describe('deploymentStats', () => {
  it('reports coverage as the invoice feed does', () => {
    const entries: DashEntry[] = ['05', '06', '07'].map((d) => ({
      deploymentId: 1,
      entryDate: `2026-10-${d}`,
      entryType: 'work',
      hours: 8,
      taskKind: null,
      status: 'approved',
    }));
    const s = deploymentStats(dep(), entries, FROM, TO);
    expect(s.coverage.approvedDays).toBe(3);
    expect(s.coverage.expectedDays).toBe(22);
    expect(s.coverage.complete).toBe(false);
  });

  it('has no expected hours outside its own dates', () => {
    const s = deploymentStats(dep({ endDate: '2026-09-30' }), [], FROM, TO);
    expect(s.expectedHours).toBe(0);
    expect(s.utilisation).toBeNull();
  });
});

describe('overAllocated', () => {
  it('flags hours a day that add up to more than the standard day', () => {
    expect(overAllocated([{ fullDayHours: 8 }, { fullDayHours: 4 }])).toBe(true);
    expect(overAllocated([{ fullDayHours: 4 }, { fullDayHours: 4 }])).toBe(false);
  });
});

describe('BR-TSH-12: a no-client-task row bills like any work row', () => {
  it('the invoice feed has no input for the task kind, so it cannot treat the row differently', () => {
    const row: SummaryEntry = { entryDate: '2026-10-05', entryType: 'work', hours: 8, status: 'approved' };
    const s = periodSummary([{ from: '2026-10-05', to: '2026-10-05', fullDayHours: 8, entries: [row] }], NONE);
    expect(s.workedDays).toBe(1);
    expect(s.unpaidLeaveDays).toBe(0);
    expect(Object.keys(row)).not.toContain('taskKind');
  });
});
