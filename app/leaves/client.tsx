'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarOff, Plus } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, Field, Modal, PageHeader, Stat, TableShell, type Tone } from '@/components/ui';
import type { MyLeave } from '@/lib/leaves';
import {
  LEAVE_STATUS_LABELS,
  LEAVE_TYPE_LABELS,
  LEAVE_TYPES,
  leaveDays,
  type LeaveStatus,
  type LeaveType,
} from '@/lib/leave-rules';

const STATUS_TONE: Record<LeaveStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'rose', cancelled: 'neutral' };

const num = (n: number) => String(Math.round(n * 100) / 100);

function whenLabel(l: Pick<MyLeave, 'startDate' | 'endDate' | 'halfDay'>): string {
  const base = l.startDate === l.endDate ? formatDate(l.startDate) : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`;
  return l.halfDay ? `${base} (half day)` : base;
}

export default function LeavesClient({ initial, holidays, today }: { initial: MyLeave[]; holidays: string[]; today: string }) {
  const router = useRouter();
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ startDate: today, endDate: today, halfDay: false, leaveType: 'paid' as LeaveType, reason: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const year = today.slice(0, 4);
  const thisYear = initial.filter((l) => l.status === 'approved' && l.startDate.startsWith(year));
  const paid = thisYear.filter((l) => l.leaveType === 'paid').reduce((s, l) => s + l.days, 0);
  const unpaid = thisYear.filter((l) => l.leaveType === 'unpaid').reduce((s, l) => s + l.days, 0);
  const pending = initial.filter((l) => l.status === 'pending').length;

  // What the request would take, counted the way the server counts it.
  const preview = form.endDate >= form.startDate ? leaveDays(form, holidaySet) : 0;

  function openForm() {
    setForm({ startDate: today, endDate: today, halfDay: false, leaveType: 'paid', reason: '' });
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setErrors({});
    setBanner(null);
    try {
      await api('/api/leaves/mine', { method: 'POST', json: form });
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: number) {
    setBusy(true);
    try {
      await api(`/api/leaves/mine/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      setBanner(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="My Leaves"
        subtitle="Apply for leave and follow its approval. Approved leave appears on your timesheet by itself."
        action={
          <button className="btn-primary" onClick={openForm}>
            <Plus className="h-4 w-4" /> Apply for leave
          </button>
        }
      />

      <div className="space-y-4 px-6 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={`Paid leave ${year}`} value={`${num(paid)} d`} sub="Approved" />
          <Stat label={`Unpaid leave ${year}`} value={`${num(unpaid)} d`} sub="Approved" />
          <Stat label="Waiting for approval" value={String(pending)} sub={pending === 1 ? 'request' : 'requests'} tone={pending ? 'warn' : 'default'} />
        </div>

        {banner && !open && (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{banner}</p>
        )}

        {initial.length === 0 ? (
          <EmptyState icon={CalendarOff} title="No leave yet" description="When you apply for leave it will be listed here with its status." />
        ) : (
          <div className="card">
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">When</th>
                  <th className="th text-right">Days</th>
                  <th className="th">Type</th>
                  <th className="th">Status</th>
                  <th className="th">Reason</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {initial.map((l) => (
                  <tr key={l.id}>
                    <td className="td">{whenLabel(l)}</td>
                    <td className="td tnum text-right">{num(l.days)}</td>
                    <td className="td">{LEAVE_TYPE_LABELS[l.leaveType]}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[l.status]}>{LEAVE_STATUS_LABELS[l.status]}</Badge>
                    </td>
                    <td className="td text-xs text-ink2">
                      {l.status === 'rejected' && l.rejectionReason ? <span className="text-rose-600 dark:text-rose-300">Rejected: {l.rejectionReason}</span> : (l.reason ?? '—')}
                    </td>
                    <td className="td text-right">
                      {l.status === 'pending' && (
                        <button className="btn-ghost" disabled={busy} onClick={() => withdraw(l.id)}>
                          Withdraw
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Apply for leave" description="Your Resource Manager approves it. Weekends and holidays are not counted.">
        <div className="space-y-4">
          {banner && <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{banner}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From" required error={errors.startDate}>
              <input
                className="input"
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate, halfDay: form.halfDay && e.target.value === form.endDate })}
              />
            </Field>
            <Field label="To" required error={errors.endDate}>
              <input
                className="input"
                type="date"
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value, halfDay: form.halfDay && form.startDate === e.target.value })}
              />
            </Field>
          </div>

          {form.startDate === form.endDate && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={form.halfDay} onChange={(e) => setForm({ ...form, halfDay: e.target.checked })} />
              Half day only
            </label>
          )}

          <Field label="Type" error={errors.leaveType} hint="Paid leave is billed to the client if the agreement allows it. Unpaid leave comes off the bill. Your manager can change this.">
            <div className="flex gap-2">
              {LEAVE_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={form.leaveType === t}
                  onClick={() => setForm({ ...form, leaveType: t })}
                  className={`flex-1 rounded border px-3 py-2 text-sm font-medium transition-colors ${form.leaveType === t ? 'border-brand bg-brandbg text-brand' : 'border-line bg-surface text-ink2 hover:bg-surface2'}`}
                >
                  {LEAVE_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Reason" error={errors.reason}>
            <textarea className="input min-h-20" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Optional" />
          </Field>

          <p className="rounded-md bg-surface2 px-3 py-2 text-sm text-ink">
            {preview > 0 ? (
              <>
                This takes <strong>{num(preview)} working day{preview === 1 ? '' : 's'}</strong>.
              </>
            ) : (
              <span className="text-ink2">These dates have no working days.</span>
            )}
          </p>

          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || preview === 0} onClick={submit}>
              Send for approval
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
