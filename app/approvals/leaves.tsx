'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, CalendarCheck } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, Field, Modal, PageHeader, TableShell, type Tone } from '@/components/ui';
import type { LeaveQueue, QueuedLeave } from '@/lib/leaves';
import { LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, LEAVE_TYPES, type LeaveStatus, type LeaveType } from '@/lib/leave-rules';

const STATUS_TONE: Record<LeaveStatus, Tone> = { pending: 'amber', approved: 'green', rejected: 'rose', cancelled: 'neutral' };
const num = (n: number) => String(Math.round(n * 100) / 100);

function whenLabel(l: Pick<QueuedLeave, 'startDate' | 'endDate' | 'halfDay'>): string {
  const base = l.startDate === l.endDate ? formatDate(l.startDate) : `${formatDate(l.startDate)} – ${formatDate(l.endDate)}`;
  return l.halfDay ? `${base} (half day)` : base;
}

/** The leave tab of the Approvals screen (FSD-21). Names, dates and reasons only. */
export default function LeaveApprovals({ queue, canReview }: { queue: LeaveQueue; canReview: boolean }) {
  const router = useRouter();
  // The approver may change paid to unpaid; kept per request until decided.
  const [types, setTypes] = useState<Record<number, LeaveType>>({});
  const [rejecting, setRejecting] = useState<QueuedLeave | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  async function decide(l: QueuedLeave, action: 'approve' | 'reject', why?: string) {
    setBusy(true);
    setBanner(null);
    setReasonError(undefined);
    try {
      await api('/api/leaves/approvals', {
        method: 'POST',
        json: { id: l.id, action, reason: why, ...(action === 'approve' ? { leaveType: types[l.id] ?? l.leaveType } : {}) },
      });
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

  const n = queue.pending.length;

  return (
    <div className="pb-12">
      <PageHeader title="Leave Approvals" subtitle={n ? `${n} request${n === 1 ? '' : 's'} waiting` : 'Nothing waiting'} />

      {banner && (
        <div className="mx-6 mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">{banner}</div>
      )}

      {n === 0 ? (
        <EmptyState icon={CalendarCheck} title="No leave waiting" description="Requests appear here once a resource applies for leave." />
      ) : (
        <div className="px-6 py-4">
          <div className="card">
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Resource</th>
                  <th className="th">When</th>
                  <th className="th text-right">Days</th>
                  <th className="th">Type</th>
                  <th className="th">Reason</th>
                  {canReview && <th className="th" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {queue.pending.map((l) => (
                  <tr key={l.id}>
                    <td className="td">
                      <span className="font-medium text-ink">{l.resourceName}</span>
                      {l.clients.length > 0 && <div className="text-2xs text-ink3">{l.clients.join(', ')}</div>}
                    </td>
                    <td className="td">{whenLabel(l)}</td>
                    <td className="td tnum text-right">{num(l.days)}</td>
                    <td className="td">
                      {canReview ? (
                        <select
                          className="input w-auto"
                          aria-label={`Leave type for ${l.resourceName}`}
                          value={types[l.id] ?? l.leaveType}
                          onChange={(e) => setTypes({ ...types, [l.id]: e.target.value as LeaveType })}
                        >
                          {LEAVE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {LEAVE_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        LEAVE_TYPE_LABELS[l.leaveType]
                      )}
                    </td>
                    <td className="td text-xs text-ink2">{l.reason ?? '—'}</td>
                    {canReview && (
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          <button className="btn-ghost" disabled={busy} onClick={() => { setRejecting(l); setReason(''); setReasonError(undefined); }}>
                            <X className="h-4 w-4" /> Reject
                          </button>
                          <button className="btn-primary" disabled={busy} onClick={() => decide(l, 'approve')}>
                            <Check className="h-4 w-4" /> Approve
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        </div>
      )}

      {queue.recent.length > 0 && (
        <div className="px-6 pb-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Recently decided</h2>
          <div className="card">
            <TableShell>
              <tbody className="divide-y divide-line">
                {queue.recent.map((l) => (
                  <tr key={l.id}>
                    <td className="td">{l.resourceName}</td>
                    <td className="td">{whenLabel(l)}</td>
                    <td className="td tnum text-right">{num(l.days)} d</td>
                    <td className="td">{LEAVE_TYPE_LABELS[l.leaveType]}</td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[l.status]}>{LEAVE_STATUS_LABELS[l.status]}</Badge>
                    </td>
                    <td className="td text-xs text-ink2">{l.status === 'rejected' && l.rejectionReason ? l.rejectionReason : (l.decidedBy ?? '')}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        </div>
      )}

      <Modal open={rejecting !== null} onClose={() => setRejecting(null)} title={`Reject leave for ${rejecting?.resourceName ?? ''}`}>
        <div className="space-y-4">
          <Field label="Reason" required error={reasonError} hint="The resource sees this">
            <textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button className="btn-danger" disabled={busy} onClick={() => rejecting && decide(rejecting, 'reject', reason)}>
              Reject
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
