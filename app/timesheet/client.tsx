'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Send, Trash2, CalendarDays } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, PageHeader, type Tone } from '@/components/ui';
import type { MyEntry, MyTimesheet } from '@/lib/timesheets';
import {
  ENTRY_STATUS_LABELS,
  ENTRY_TYPES,
  ENTRY_TYPE_LABELS,
  TIMESHEET_VERSION_LABELS,
  dayHours,
  dayValue,
  isEditable,
  isExpectedDay,
  shiftDate,
  weekDates,
  type EntryStatus,
  type EntryType,
} from '@/lib/timesheet-rules';

type RowForm = { entryType: EntryType; hours: string; task: string };

const STATUS_TONE: Record<EntryStatus, Tone> = {
  draft: 'neutral',
  submitted: 'amber',
  approved: 'green',
  rejected: 'rose',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toForm(rows: MyEntry[]): RowForm[] {
  return rows.map((r) => ({ entryType: r.entryType, hours: String(r.hours), task: r.task ?? '' }));
}

export default function TimesheetClient({
  initial,
  initialWeek,
}: {
  initial: MyTimesheet;
  initialWeek: string;
}) {
  const [data, setData] = useState(initial);
  const [week, setWeek] = useState(initialWeek);
  const [deploymentId, setDeploymentId] = useState<number | null>(
    initial.deployments.find((d) => d.status === 'active')?.id ?? initial.deployments[0]?.id ?? null,
  );
  const [drafts, setDrafts] = useState<Record<string, RowForm[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'error' | 'ok'; text: string } | null>(null);

  const dates = useMemo(() => weekDates(week), [week]);
  const deployment = data.deployments.find((d) => d.id === deploymentId) ?? null;
  const holidayByDate = useMemo(
    () => new Map(data.holidays.map((h) => [h.date, h.name])),
    [data.holidays],
  );
  const holidaySet = useMemo(() => new Set(holidayByDate.keys()), [holidayByDate]);

  const entriesByDate = useMemo(() => {
    const m = new Map<string, MyEntry[]>();
    for (const e of data.entries) {
      if (e.deploymentId !== deploymentId) continue;
      m.set(e.entryDate, [...(m.get(e.entryDate) ?? []), e]);
    }
    return m;
  }, [data.entries, deploymentId]);

  // The form for each day starts from what is saved. An empty day that is a
  // holiday starts as a holiday row (G-RES-03) — a suggestion, saved only when
  // the resource saves the day.
  useEffect(() => {
    const next: Record<string, RowForm[]> = {};
    for (const date of dates) {
      const saved = entriesByDate.get(date);
      if (saved?.length) next[date] = toForm(saved);
      else if (holidayByDate.has(date)) next[date] = [{ entryType: 'holiday', hours: '0', task: holidayByDate.get(date) ?? '' }];
      else next[date] = [];
    }
    setDrafts(next);
  }, [dates, entriesByDate, holidayByDate]);

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

  function setRows(date: string, rows: RowForm[]) {
    setDrafts((d) => ({ ...d, [date]: rows }));
  }

  async function saveDay(date: string) {
    if (!deployment) return;
    setBusy(date);
    setBanner(null);
    try {
      await api('/api/timesheets/mine/day', {
        method: 'PUT',
        json: { deploymentId: deployment.id, date, rows: drafts[date] ?? [] },
      });
      await load(week);
      setBanner({ tone: 'ok', text: `Saved ${formatDate(date)}.` });
    } catch (e) {
      setBanner({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  async function submitWeek() {
    if (!deployment) return;
    setBusy('submit');
    setBanner(null);
    try {
      const res = await api<{ submitted: number }>('/api/timesheets/mine/submit', {
        method: 'POST',
        json: { deploymentId: deployment.id, from: dates[0], to: dates[6] },
      });
      await load(week);
      setBanner({
        tone: 'ok',
        text: res.submitted ? 'Week submitted for approval.' : 'Nothing to submit — save some days first.',
      });
    } catch (e) {
      setBanner({ tone: 'error', text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  }

  if (!data.deployments.length) {
    return (
      <div className="pb-12">
        <PageHeader title="My Timesheet" subtitle={data.profile.name} />
        <EmptyState
          icon={CalendarDays}
          title="No deployments yet"
          description="Once you are deployed on a project, it will appear here to record time against."
        />
      </div>
    );
  }

  const weekHours = dates.reduce(
    (s, d) => s + dayHours((drafts[d] ?? []).map((r) => ({ entryType: r.entryType, hours: Number(r.hours) || 0 }))),
    0,
  );
  const draftDays = dates.filter((d) => entriesByDate.get(d)?.some((e) => isEditable(e.status))).length;

  return (
    <div className="pb-12">
      <PageHeader
        title="My Timesheet"
        subtitle={`${data.profile.name}${data.profile.designation ? ` · ${data.profile.designation}` : ''}`}
        action={
          <button className="btn-primary" onClick={submitWeek} disabled={busy !== null || draftDays === 0}>
            <Send className="h-4 w-4" /> Submit week{draftDays ? ` (${draftDays} day${draftDays === 1 ? '' : 's'})` : ''}
          </button>
        }
      />

      <div className="space-y-4 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className="input w-auto"
            value={deploymentId ?? ''}
            onChange={(e) => setDeploymentId(Number(e.target.value))}
            aria-label="Deployment"
          >
            {data.deployments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.projectName} · {d.clientName}
                {d.status !== 'active' ? ' (ended)' : ''}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button className="btn-ghost" onClick={() => load(shiftDate(week, -7))} aria-label="Previous week">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="tnum min-w-48 text-center text-sm text-ink">
              {formatDate(dates[0])} – {formatDate(dates[6])}
            </span>
            <button className="btn-ghost" onClick={() => load(shiftDate(week, 7))} aria-label="Next week">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="tnum text-xs text-ink2">{weekHours} h this week</span>
        </div>

        {deployment && (
          <p className="text-xs text-ink3">
            {TIMESHEET_VERSION_LABELS[deployment.version]} · a full day is {deployment.fullDayHours} h ·{' '}
            {formatDate(deployment.startDate)} to {deployment.endDate ? formatDate(deployment.endDate) : 'ongoing'}
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
          <div className="space-y-2">
            {dates.map((date) => {
              const saved = entriesByDate.get(date) ?? [];
              const status: EntryStatus | null = saved[0]?.status ?? null;
              const editable = !status || isEditable(status);
              const inWindow = date >= deployment.startDate && (!deployment.endDate || date <= deployment.endDate);
              const rows = drafts[date] ?? [];
              const value = dayValue(
                rows.map((r) => ({ entryType: r.entryType, hours: Number(r.hours) || 0 })),
                deployment.fullDayHours,
                isExpectedDay(date, holidaySet),
              );
              const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
              const isWeekend = weekday === 0 || weekday === 6;

              return (
                <div key={date} className={`card px-4 py-3 ${!inWindow ? 'opacity-50' : ''}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-10 text-sm font-medium text-ink">{DAY_NAMES[weekday]}</span>
                      <span className="tnum text-xs text-ink2">{formatDate(date)}</span>
                      {holidayByDate.has(date) && <Badge tone="violet">{holidayByDate.get(date)}</Badge>}
                      {status && <Badge tone={STATUS_TONE[status]}>{ENTRY_STATUS_LABELS[status]}</Badge>}
                    </div>
                    {inWindow && rows.length > 0 && (
                      <span className="tnum text-2xs text-ink3">
                        {value.holiday
                          ? 'Holiday'
                          : `${value.worked} day worked${value.paidLeave ? ` · ${value.paidLeave} paid leave` : ''}${
                              value.unpaidLeave ? ` · ${value.unpaidLeave} unpaid` : ''
                            }`}
                      </span>
                    )}
                  </div>

                  {saved[0]?.status === 'rejected' && saved[0].rejectionReason && (
                    <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                      Rejected: {saved[0].rejectionReason}
                    </p>
                  )}

                  {!inWindow ? (
                    <p className="mt-1 text-2xs text-ink3">Outside this deployment.</p>
                  ) : (
                    <>
                      <div className="mt-2 space-y-2">
                        {rows.map((row, i) => (
                          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_6rem_1fr_auto]">
                            <select
                              className="input"
                              value={row.entryType}
                              disabled={!editable}
                              aria-label="Type"
                              onChange={(e) =>
                                setRows(date, rows.map((r, j) => (j === i ? { ...r, entryType: e.target.value as EntryType } : r)))
                              }
                            >
                              {ENTRY_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {ENTRY_TYPE_LABELS[t]}
                                </option>
                              ))}
                            </select>
                            <input
                              className="input"
                              type="number"
                              min={0}
                              max={24}
                              step="0.25"
                              placeholder="Hours"
                              aria-label="Hours"
                              value={row.hours}
                              disabled={!editable}
                              onChange={(e) => setRows(date, rows.map((r, j) => (j === i ? { ...r, hours: e.target.value } : r)))}
                            />
                            <input
                              className="input"
                              placeholder={deployment.version === 'v2' ? 'Task' : 'What you worked on'}
                              aria-label="Task"
                              value={row.task}
                              disabled={!editable}
                              onChange={(e) => setRows(date, rows.map((r, j) => (j === i ? { ...r, task: e.target.value } : r)))}
                            />
                            {editable && (
                              <button
                                className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                                onClick={() => setRows(date, rows.filter((_, j) => j !== i))}
                                aria-label="Remove row"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {editable && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {(deployment.version === 'v2' || rows.length === 0) && (
                            <button
                              className="btn-ghost"
                              onClick={() =>
                                setRows(date, [
                                  ...rows,
                                  {
                                    entryType: 'work',
                                    hours: deployment.version === 'v1' ? String(deployment.fullDayHours) : '',
                                    task: '',
                                  },
                                ])
                              }
                            >
                              <Plus className="h-3.5 w-3.5" /> {deployment.version === 'v2' ? 'Add task' : 'Add entry'}
                            </button>
                          )}
                          {(rows.length > 0 || saved.length > 0) && (
                            <button className="btn-ghost" onClick={() => saveDay(date)} disabled={busy !== null}>
                              {busy === date ? 'Saving…' : 'Save day'}
                            </button>
                          )}
                          {isWeekend && rows.length === 0 && (
                            <span className="text-2xs text-ink3">Weekend — record only if you worked.</span>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
