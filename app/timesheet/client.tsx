'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Save, Send, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { formatDate, today as todayISO } from '@/lib/utils';
import { EmptyState, PageHeader } from '@/components/ui';
import type { MyEntry, MyTimesheet } from '@/lib/timesheets';
import {
  ENTRY_STATUS_LABELS,
  STANDARD_DAY_HOURS,
  TASK_KIND_LABELS,
  isEditable,
  shiftDate,
  weekDates,
  weekStart,
  weekday,
  type EntryStatus,
} from '@/lib/timesheet-rules';
import {
  buildGrid,
  dayRowsFromGrid,
  daySignature,
  dayStatus,
  dayTone,
  expectedHours,
  gridDayTotal,
  isoWeekNumber,
  monthChoices,
  monthKey,
  monthsIn,
  parseHours,
  savedDayRows,
  weeksOfMonth,
  type DayTone,
  type GridRow,
  type SavedEntry,
} from '@/lib/timesheet-week';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m: string) => MONTH_NAMES[Number(m.slice(5, 7)) - 1];
const monthLabel = (m: string) => `${monthName(m)} ${m.slice(0, 4)}`;
const num = (n: number) => String(Math.round(n * 100) / 100);
const short = (d: string) => `${Number(d.slice(8))} ${monthName(monthKey(d)).slice(0, 3)}`;

const STATUS_TEXT: Record<EntryStatus, string> = {
  draft: 'text-ink3',
  submitted: 'text-amber-600 dark:text-amber-400',
  approved: 'text-emerald-600 dark:text-emerald-400',
  rejected: 'text-rose-600 dark:text-rose-400',
};

/** The Total row: green at a full day, red short or over, red for a holiday. */
const TOTAL_CLASS: Record<DayTone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  short: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  over: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  holiday: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  leave: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  rest: 'text-ink3',
  wait: 'text-ink3',
};

export default function TimesheetClient({ initial, initialWeek }: { initial: MyTimesheet; initialWeek: string }) {
  const today = todayISO();
  const [data, setData] = useState(initial);
  const [week, setWeek] = useState(initialWeek);
  // The month being filled in. A week across two months shows both, but only
  // this month's days can be changed; the other is view-only until switched.
  const [month, setMonth] = useState(() => (weekDates(initialWeek).some((d) => monthKey(d) === monthKey(today)) ? monthKey(today) : monthKey(initialWeek)));
  const [deploymentId, setDeploymentId] = useState<number | null>(
    initial.deployments.find((d) => d.status === 'active')?.id ?? initial.deployments[0]?.id ?? null,
  );
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);
  const [nextKey, setNextKey] = useState(0);

  const dates = useMemo(() => weekDates(week), [week]);
  const monthsInWeek = useMemo(() => monthsIn(dates), [dates]);
  const deployment = data.deployments.find((d) => d.id === deploymentId) ?? null;

  const saved: SavedEntry[] = useMemo(
    () =>
      data.entries
        .filter((e) => e.deploymentId === deploymentId)
        .map((e) => ({ entryDate: e.entryDate, entryType: e.entryType, hours: e.hours, task: e.task, taskKind: e.taskKind })),
    [data.entries, deploymentId],
  );
  const savedByDate = useMemo(() => {
    const m = new Map<string, MyEntry[]>();
    for (const e of data.entries) {
      if (e.deploymentId !== deploymentId) continue;
      m.set(e.entryDate, [...(m.get(e.entryDate) ?? []), e]);
    }
    return m;
  }, [data.entries, deploymentId]);

  /** Holidays that apply to this deployment: company-wide, or its own client's. */
  const calendar = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of data.holidays) if (h.clientName === null || h.clientName === deployment?.clientName) m.set(h.date, h.name);
    return m;
  }, [data.holidays, deployment?.clientName]);

  // Tasks used before, and the fixed task on a billable project (D17).
  const taskSuggestions = useMemo(() => {
    const names = new Set(data.taskNames);
    for (const e of data.entries) if (e.entryType === 'work' && e.task && !e.taskKind) names.add(e.task.trim());
    const list = [...names].sort((a, b) => a.localeCompare(b));
    return deployment?.billable ? [...list, TASK_KIND_LABELS.no_client_tasks] : list;
  }, [data.taskNames, data.entries, deployment?.billable]);

  // The grid starts from what is saved, and starts again after a save reloads it.
  useEffect(() => {
    setGrid(buildGrid(saved, TASK_KIND_LABELS.no_client_tasks));
  }, [saved]);

  const full = deployment?.fullDayHours ?? STANDARD_DAY_HOURS;

  function holidayName(date: string): string | null {
    const c = calendar.get(date);
    if (c) return c;
    const marked = savedByDate.get(date)?.find((e) => e.entryType === 'holiday');
    return marked ? (marked.task ?? 'Holiday') : null;
  }

  /** Approved leave takes hours off what is expected; a pending request is only noted. */
  function leaveOn(date: string) {
    const rows = data.leaves.filter((l) => l.date === date);
    return {
      approved: Math.min(1, rows.filter((l) => l.status === 'approved').reduce((s, l) => s + l.fraction, 0)),
      pending: rows.some((l) => l.status === 'pending'),
    };
  }

  function inWindow(date: string): boolean {
    return !!deployment && date >= deployment.startDate && (!deployment.endDate || date <= deployment.endDate);
  }

  /** Open for typing: the month being filled in, inside the project, not submitted or approved, and not a whole day of leave. */
  function editable(date: string): boolean {
    if (monthKey(date) !== month || !inWindow(date)) return false;
    if (leaveOn(date).approved >= 1) return false;
    return (savedByDate.get(date) ?? []).every((r) => isEditable(r.status));
  }

  function setCell(rowKey: string, date: string, value: string) {
    setGrid((g) => g.map((r) => (r.key === rowKey ? { ...r, cells: { ...r.cells, [date]: value } } : r)));
  }

  function addTask() {
    const key = `n${nextKey}`;
    setNextKey((k) => k + 1);
    setGrid((g) => [...g, { key, label: '', cells: {} }]);
  }

  /* ── Moving around ── */

  async function load(nextWeek: string) {
    const days = weekDates(nextWeek);
    setBanner(null);
    try {
      setData(await api<MyTimesheet>(`/api/timesheets/mine?from=${days[0]}&to=${days[6]}`));
      setWeek(days[0]);
    } catch (e) {
      setBanner({ tone: 'error', text: errorMessage(e) });
    }
  }

  async function goTo(nextWeek: string, nextMonth: string) {
    setMonth(nextMonth);
    if (nextWeek !== week) await load(nextWeek);
  }

  function pickMonth(m: string) {
    const weeks = weeksOfMonth(m);
    // Today's week if the month is this one, else the month's first week.
    const target = weeks.find((w) => weekDates(w.week).includes(today)) ?? weeks[0];
    return goTo(target.week, m);
  }

  function step(by: -1 | 1) {
    const nextWeek = shiftDate(week, 7 * by);
    const ms = monthsIn(weekDates(nextWeek));
    return goTo(nextWeek, ms.includes(month) ? month : ms[by === 1 ? 0 : ms.length - 1]);
  }

  /* ── Saving ── */

  function problems(): string[] {
    const out: string[] = [];
    for (const date of dates) {
      if (!editable(date)) continue;
      const label = `${DAY_NAMES[weekday(date)]} ${short(date)}`;
      for (const r of grid) if (parseHours(r.cells[date]) === null) out.push(`${label}: "${r.cells[date]}" is not a number of hours.`);
      if (gridDayTotal(grid, date) > 24) out.push(`${label}: a day cannot hold more than 24 hours.`);
    }
    return out;
  }

  /** Writes the days that changed. False when something stopped it. */
  async function persist(): Promise<boolean> {
    if (!deployment) return false;
    const issues = problems();
    if (issues.length) {
      setBanner({ tone: 'error', text: issues.join(' ') });
      return false;
    }
    for (const date of dates) {
      if (!editable(date)) continue;
      const rows = dayRowsFromGrid(grid, date, saved, TASK_KIND_LABELS.no_client_tasks);
      if (daySignature(rows) === daySignature(savedDayRows(saved, date))) continue;
      await api('/api/timesheets/mine/day', { method: 'PUT', json: { deploymentId: deployment.id, date, rows } });
    }
    return true;
  }

  async function saveWeek() {
    setBusy(true);
    setBanner(null);
    try {
      if (await persist()) {
        await load(week);
        setBanner({ tone: 'ok', text: 'Saved.' });
      }
    } catch (e) {
      setBanner({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const monthDates = dates.filter((d) => monthKey(d) === month);
  const submittable = monthDates.filter(
    (d) => inWindow(d) && (gridDayTotal(grid, d) > 0 || (savedByDate.get(d) ?? []).some((r) => r.entryType !== 'holiday' && isEditable(r.status))),
  ).length;

  async function submitMonthPart() {
    if (!deployment || monthDates.length === 0) return;
    setBusy(true);
    setBanner(null);
    try {
      if (!(await persist())) return;
      const res = await api<{ submitted: number }>('/api/timesheets/mine/submit', {
        method: 'POST',
        json: { deploymentId: deployment.id, from: monthDates[0], to: monthDates[monthDates.length - 1] },
      });
      await load(week);
      setBanner({ tone: 'ok', text: res.submitted ? `${monthName(month)} days submitted for approval.` : 'Nothing to submit. Enter some hours first.' });
    } catch (e) {
      setBanner({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!data.deployments.length) {
    return (
      <div className="pb-12">
        <PageHeader title="My Timesheet" subtitle={data.profile.name} />
        <EmptyState icon={CalendarDays} title="No deployments yet" description="Once you are deployed on a project, it will appear here to record time against." />
      </div>
    );
  }

  const monthOptions = deployment ? monthChoices(deployment.startDate, deployment.endDate, today) : [monthKey(today)];
  const weekOptions = weeksOfMonth(month);
  const weekTotal = dates.reduce((s, d) => s + gridDayTotal(grid, d), 0);
  const rejected = dates
    .map((d) => ({ d, r: (savedByDate.get(d) ?? []).find((e) => e.status === 'rejected' && e.rejectionReason) }))
    .filter((x) => x.r);

  return (
    <div className="pb-12">
      <PageHeader
        title="My Timesheet"
        subtitle={`${data.profile.name}${data.profile.designation ? ` · ${data.profile.designation}` : ''}`}
        action={
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={saveWeek} disabled={busy}>
              <Save className="h-4 w-4" /> Save
            </button>
            <button className="btn-primary" onClick={submitMonthPart} disabled={busy || submittable === 0}>
              <Send className="h-4 w-4" /> Submit{submittable ? ` (${submittable} day${submittable === 1 ? '' : 's'})` : ''}
            </button>
          </div>
        }
      />

      <div className="space-y-4 px-6 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-2xs text-ink3">
            Project
            <select className="input mt-0.5 w-auto" value={deploymentId ?? ''} onChange={(e) => setDeploymentId(Number(e.target.value))}>
              {data.deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.projectName} · {d.clientName}
                  {d.status !== 'active' ? ' (ended)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="text-2xs text-ink3">
            Month
            <select className="input mt-0.5 w-auto" value={month} onChange={(e) => pickMonth(e.target.value)}>
              {(monthOptions.includes(month) ? monthOptions : [month, ...monthOptions]).map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-2xs text-ink3">
            Week
            <select className="input mt-0.5 w-auto" value={week} onChange={(e) => goTo(e.target.value, month)}>
              {weekOptions.map((w) => {
                const all = weekDates(w.week);
                return (
                  <option key={w.week} value={w.week}>
                    Week {w.number} · {short(all[0])} – {short(all[6])}
                  </option>
                );
              })}
            </select>
          </label>
          <div className="flex items-center gap-1">
            <button className="btn-ghost" onClick={() => step(-1)} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button className="btn-ghost" onClick={() => step(1)} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
            <button className="btn-ghost" onClick={() => goTo(weekStart(today), monthKey(today))}>
              Today
            </button>
          </div>
          {monthsInWeek.length > 1 && (
            <div className="flex items-center overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="Month to fill in">
              <span className="px-2.5 text-xs text-ink3">Fill in</span>
              {monthsInWeek.map((m) => (
                <button
                  key={m}
                  aria-pressed={m === month}
                  onClick={() => setMonth(m)}
                  className={`border-l border-line px-3 py-1.5 transition-colors ${m === month ? 'bg-brandbg font-semibold text-brand' : 'bg-surface text-ink2 hover:bg-surface2'}`}
                >
                  {monthName(m).slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          <span className="tnum pb-2 text-xs text-ink2">
            Week {isoWeekNumber(week)} · {num(weekTotal)} h
          </span>
        </div>

        {deployment && (
          <p className="text-xs text-ink3">
            A full day is {deployment.fullDayHours} h · {formatDate(deployment.startDate)} to{' '}
            {deployment.endDate ? formatDate(deployment.endDate) : 'ongoing'}
          </p>
        )}

        {banner && (
          <div
            className={`rounded-md border px-3 py-2 text-sm ${
              banner.tone === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
            }`}
          >
            {banner.text}
          </div>
        )}

        {deployment && (
          <div className="card overflow-x-auto">
            <datalist id="task-names">
              {taskSuggestions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <table className="w-full min-w-[820px] border-collapse tnum">
              <thead>
                {monthsInWeek.length > 1 && (
                  <tr className="text-2xs uppercase tracking-wider">
                    <th className="sticky left-0 z-10 bg-surface" />
                    {monthsInWeek.map((m) => (
                      <th
                        key={m}
                        colSpan={dates.filter((d) => monthKey(d) === m).length}
                        className={`border-b border-line px-2 py-1 font-semibold ${m === month ? 'bg-brandbg text-brand' : 'bg-surface2 text-ink3'}`}
                      >
                        {monthName(m)} {m === month ? '' : '· view only'}
                      </th>
                    ))}
                    <th />
                  </tr>
                )}
                <tr>
                  <th className="sticky left-0 z-10 min-w-52 border-b border-r border-line bg-surface px-4 py-2 text-left text-xs font-semibold text-ink2">Tasks</th>
                  {dates.map((date) => {
                    const hol = holidayName(date);
                    const weekend = weekday(date) === 0 || weekday(date) === 6;
                    const st = dayStatus((savedByDate.get(date) ?? []).map((e) => e.status));
                    const lv = leaveOn(date);
                    return (
                      <th key={date} className={`border-b border-line px-1.5 py-2 text-center font-normal ${hol ? 'bg-rose-50 dark:bg-rose-950' : weekend ? 'bg-surface2' : ''} ${monthKey(date) !== month ? 'opacity-60' : ''}`}>
                        <span className={`block text-sm font-semibold ${hol ? 'text-rose-700 dark:text-rose-300' : 'text-ink'}`}>{Number(date.slice(8))}</span>
                        <span className="block text-2xs text-ink3">{DAY_NAMES[weekday(date)]}</span>
                        {hol ? (
                          <>
                            <span className="block text-2xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">Holiday</span>
                            <span className="mx-auto block max-w-24 break-words text-2xs leading-tight text-rose-700 dark:text-rose-300">{hol}</span>
                          </>
                        ) : lv.approved > 0 ? (
                          <span className="block text-2xs text-violet-600 dark:text-violet-300">{lv.approved < 1 ? 'Half-day leave' : 'Leave'}</span>
                        ) : st ? (
                          <span className={`block text-2xs ${STATUS_TEXT[st]}`}>{ENTRY_STATUS_LABELS[st]}</span>
                        ) : null}
                      </th>
                    );
                  })}
                  <th className="border-b border-l border-line px-3 py-2 text-xs font-semibold text-ink2">Total</th>
                </tr>
              </thead>
              <tbody>
                {grid.map((row) => {
                  const rowTotal = dates.reduce((s, d) => s + (parseHours(row.cells[d]) ?? 0), 0);
                  const lockedWithHours = dates.some((d) => !editable(d) && (parseHours(row.cells[d]) ?? 0) > 0);
                  const canRemove = !lockedWithHours;
                  return (
                    <tr key={row.key}>
                      <td className="sticky left-0 z-10 border-b border-r border-line bg-surface px-4 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <input
                            className="input h-8 w-48"
                            list="task-names"
                            placeholder="Task name"
                            aria-label="Task"
                            value={row.label}
                            disabled={lockedWithHours}
                            onChange={(e) => setGrid((g) => g.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                          />
                          {canRemove && (
                            <button className="rounded p-1 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950" aria-label="Remove task" onClick={() => setGrid((g) => g.filter((r) => r.key !== row.key))}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                      {dates.map((date) => {
                        const hol = holidayName(date);
                        const weekend = weekday(date) === 0 || weekday(date) === 6;
                        const v = row.cells[date] ?? '';
                        return (
                          <td key={date} className={`border-b border-line px-1.5 py-1.5 text-center ${hol ? 'bg-rose-50 dark:bg-rose-950' : weekend ? 'bg-surface2' : ''} ${monthKey(date) !== month ? 'opacity-60' : ''}`}>
                            {editable(date) ? (
                              <input
                                className="input h-8 w-16 px-1 text-center"
                                type="number"
                                min={0}
                                max={24}
                                step="0.25"
                                inputMode="decimal"
                                placeholder={hol ? 'Off' : '–'}
                                title={hol ? `Holiday: ${hol}. Enter hours only if you worked.` : undefined}
                                aria-label={`${row.label || 'Task'}, ${DAY_NAMES[weekday(date)]} ${short(date)}`}
                                value={v}
                                onChange={(e) => setCell(row.key, date, e.target.value)}
                              />
                            ) : (
                              <span className={`inline-block min-w-16 text-sm ${Number(v) ? 'font-medium text-ink' : 'text-ink3'}`}>{Number(v) ? v : '–'}</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border-b border-l border-line px-3 text-center text-sm font-medium text-ink">{rowTotal ? num(rowTotal) : '–'}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="sticky left-0 z-10 border-r border-line bg-surface px-4 py-1.5">
                    <button className="btn-ghost" onClick={addTask}>
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </button>
                  </td>
                  <td colSpan={8} className="px-3 text-xs text-ink3">
                    {grid.length === 0 ? 'Add a task, then enter the hours you worked each day.' : ''}
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="text-sm font-semibold">
                  <td className="sticky left-0 z-10 border-r border-t-2 border-line bg-surface px-4 py-2 text-ink">Total</td>
                  {dates.map((date) => {
                    const total = gridDayTotal(grid, date);
                    const hol = holidayName(date);
                    const lv = leaveOn(date);
                    const legacyLeave = (savedByDate.get(date) ?? []).filter((r) => r.entryType === 'paid_leave' || r.entryType === 'unpaid_leave').reduce((s, r) => s + r.hours, 0);
                    const expected = expectedHours(full, legacyLeave + lv.approved * full);
                    const tone = dayTone({ worked: total, expected, holiday: hol !== null, weekend: weekday(date) === 0 || weekday(date) === 6, date, today });
                    // Say why a day is coloured, so red is never a puzzle.
                    const onLeave = expected < full && lv.approved > 0;
                    const why = onLeave ? ` · ${num(expected)} h expected (half-day leave)` : '';
                    const reason =
                      tone === 'short'
                        ? `${num(expected - total)} h short${why}`
                        : tone === 'over'
                          ? `${num(total - expected)} h over${why}`
                          : tone === 'ok'
                            ? onLeave
                              ? `Full day (half-day leave)`
                              : 'Full day'
                            : '';
                    return (
                      <td key={date} title={reason || undefined} className={`border-t-2 border-line px-1.5 py-2 text-center ${TOTAL_CLASS[tone]} ${monthKey(date) !== month ? 'opacity-60' : ''}`}>
                        {hol && total === 0 ? 'Holiday' : tone === 'leave' && total === 0 ? 'Leave' : total ? num(total) : '–'}
                        {reason && <span className="block text-2xs font-normal">{reason}</span>}
                      </td>
                    );
                  })}
                  <td className="border-l border-t-2 border-line px-3 py-2 text-center text-ink">{num(weekTotal)}</td>
                </tr>
              </tfoot>
            </table>

            {dates.some((d) => holidayName(d)) && (
              <div className="space-y-1 border-t border-line px-4 py-3">
                {dates
                  .filter((d) => holidayName(d))
                  .map((d) => (
                    <p key={d} className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                      <strong>
                        {DAY_NAMES[weekday(d)]} {short(d)} is a holiday ({holidayName(d)}).
                      </strong>{' '}
                      No hours are expected. Enter hours only if you worked that day.
                    </p>
                  ))}
              </div>
            )}

            {rejected.length > 0 && (
              <div className="space-y-1 border-t border-line px-4 py-3">
                {rejected.map(({ d, r }) => (
                  <p key={d} className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                    <strong>
                      {DAY_NAMES[weekday(d)]} {short(d)} rejected:
                    </strong>{' '}
                    {r?.rejectionReason}
                  </p>
                ))}
              </div>
            )}
            {monthsInWeek.length > 1 && (
              <p className="border-t border-line px-4 py-3 text-xs text-ink2">
                This week runs into {monthName(monthsInWeek.find((m) => m !== month) ?? month)}. Use <strong>Fill in</strong> above to switch; Save and Submit apply to {monthName(month)} only.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
