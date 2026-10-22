'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, ClipboardCheck } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, Field, Modal, PageHeader } from '@/components/ui';
import type { QueueGroup } from '@/lib/timesheets';
import {
  APPROVAL_CADENCE_LABELS,
  ENTRY_TYPE_LABELS,
  dayValue,
  weekday,
} from '@/lib/timesheet-rules';

const dayKey = (deploymentId: number, date: string) => `${deploymentId}:${date}`;

function periodLabel(g: QueueGroup): string {
  if (g.cadence === 'daily') return formatDate(g.period);
  if (g.cadence === 'monthly') {
    return new Date(`${g.period}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  return `Week of ${formatDate(g.period)}`;
}

export default function ApprovalsClient({ initial, canReview }: { initial: QueueGroup[]; canReview: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejecting, setRejecting] = useState<{ deploymentId: number; date: string }[] | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const totalDays = useMemo(() => initial.reduce((s, g) => s + g.days.length, 0), [initial]);

  function toggle(k: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function selectedDays() {
    return initial.flatMap((g) =>
      g.days.filter((d) => selected.has(dayKey(d.deploymentId, d.date))).map((d) => ({ deploymentId: d.deploymentId, date: d.date })),
    );
  }

  async function review(action: 'approve' | 'reject', days: { deploymentId: number; date: string }[], why?: string) {
    setBusy(true);
    setBanner(null);
    setReasonError(undefined);
    try {
      await api('/api/timesheets/approvals', { method: 'POST', json: { action, days, reason: why } });
      setSelected(new Set());
      setRejecting(null);
      setReason('');
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields?.reason) setReasonError(e.fields.reason);
      else setBanner(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const chosen = selected.size;

  return (
    <div className="pb-12">
      <PageHeader
        title="Timesheet Approvals"
        subtitle={totalDays ? `${totalDays} submitted day${totalDays === 1 ? '' : 's'} waiting` : 'Nothing waiting'}
        action={
          canReview && chosen > 0 ? (
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={() => setRejecting(selectedDays())} disabled={busy}>
                <X className="h-4 w-4" /> Reject {chosen}
              </button>
              <button className="btn-primary" onClick={() => review('approve', selectedDays())} disabled={busy}>
                <Check className="h-4 w-4" /> Approve {chosen}
              </button>
            </div>
          ) : undefined
        }
      />

      {banner && (
        <div className="mx-6 mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {banner}
        </div>
      )}

      {initial.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No timesheets waiting"
          description="Days appear here once a resource submits them."
        />
      ) : (
        <div className="space-y-4 px-6 py-4">
          {initial.map((g) => {
            const keys = g.days.map((d) => dayKey(d.deploymentId, d.date));
            const allOn = keys.every((k) => selected.has(k));
            const hours = g.days.reduce((s, d) => s + d.hours, 0);
            return (
              <div key={g.key} className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {canReview && (
                      <input
                        type="checkbox"
                        checked={allOn}
                        aria-label={`Select all of ${g.resourceName}, ${periodLabel(g)}`}
                        onChange={() =>
                          setSelected((s) => {
                            const next = new Set(s);
                            for (const k of keys) {
                              if (allOn) next.delete(k);
                              else next.add(k);
                            }
                            return next;
                          })
                        }
                      />
                    )}
                    <div>
                      <div className="text-sm font-medium text-ink">{g.resourceName}</div>
                      <div className="text-2xs text-ink3">
                        {g.projectName} · {g.clientName}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="neutral">{APPROVAL_CADENCE_LABELS[g.cadence]}</Badge>
                    <span className="tnum text-xs text-ink2">
                      {periodLabel(g)} · {g.days.length} day{g.days.length === 1 ? '' : 's'} · {hours} h
                    </span>
                    {canReview && (
                      <button className="btn-ghost" disabled={busy} onClick={() => review('approve', g.days)}>
                        <Check className="h-3.5 w-3.5" /> Approve all
                      </button>
                    )}
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {g.days.map((d) => {
                    const k = dayKey(d.deploymentId, d.date);
                    const wd = weekday(d.date);
                    const v = dayValue(d.rows, g.fullDayHours, wd !== 0 && wd !== 6);
                    return (
                      <li key={k} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                        {canReview && (
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={selected.has(k)}
                            onChange={() => toggle(k)}
                            aria-label={`Select ${formatDate(d.date)}`}
                          />
                        )}
                        <div className="w-28 shrink-0">
                          <div className="tnum text-sm text-ink">{formatDate(d.date)}</div>
                          <div className="tnum text-2xs text-ink3">
                            {d.hours} h ·{' '}
                            {v.holiday ? 'holiday' : `${v.worked} day${v.unpaidLeave ? `, ${v.unpaidLeave} unpaid` : ''}`}
                          </div>
                        </div>
                        <ul className="min-w-0 flex-1 space-y-0.5 text-xs text-ink2">
                          {d.rows.map((r, i) => (
                            <li key={i}>
                              <span className="text-ink">{ENTRY_TYPE_LABELS[r.entryType]}</span>
                              <span className="tnum"> · {r.hours} h</span>
                              {r.task ? ` · ${r.task}` : ''}
                            </li>
                          ))}
                        </ul>
                        {canReview && (
                          <div className="flex gap-1">
                            <button
                              className="rounded p-1.5 text-ink3 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950"
                              disabled={busy}
                              onClick={() => review('approve', [{ deploymentId: d.deploymentId, date: d.date }])}
                              aria-label={`Approve ${formatDate(d.date)}`}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                              disabled={busy}
                              onClick={() => setRejecting([{ deploymentId: d.deploymentId, date: d.date }])}
                              aria-label={`Reject ${formatDate(d.date)}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title={`Reject ${rejecting?.length ?? 0} day${rejecting?.length === 1 ? '' : 's'}`}
      >
        <div className="space-y-4">
          <Field label="Reason" required error={reasonError} hint="The resource sees this and corrects the day">
            <textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              disabled={busy}
              onClick={() => rejecting && review('reject', rejecting, reason)}
            >
              Reject
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
