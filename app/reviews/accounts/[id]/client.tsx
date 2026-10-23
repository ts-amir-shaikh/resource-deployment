'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Send, Undo2 } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import type { AccountReviewDetail } from '@/lib/reviews';
import { ACCOUNT_RATINGS, ACCOUNT_RATING_LABELS, isReviewEditable, periodLabel } from '@/lib/review-rules';
import { Field, Modal, PageHeader, TableShell } from '@/components/ui';
import { RatingBadge, ReturnedNote, ReviewStatusBadge, ScoreValue } from '@/components/review-ui';

export default function AccountReviewClient({
  review: r,
  canEdit,
  canApprove,
  showPerformance,
}: {
  review: AccountReviewDetail;
  canEdit: boolean;
  canApprove: boolean;
  showPerformance: boolean;
}) {
  const router = useRouter();
  const editable = canEdit && isReviewEditable(r.status);
  const [form, setForm] = useState({
    rating: r.rating ?? '',
    summary: r.summary ?? '',
    risks: r.risks ?? '',
    opportunities: r.opportunities ?? '',
    actions: r.actions ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setBanner(null);
    setErrors({});
    try {
      await fn();
      setBanner({ tone: 'ok', text: done });
      router.refresh();
      return true;
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner({ tone: 'error', text: errorMessage(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api(`/api/reviews/accounts/${r.id}`, { method: 'PUT', json: form }), 'Saved.');
  const submit = () =>
    run(async () => {
      await api(`/api/reviews/accounts/${r.id}`, { method: 'PUT', json: form });
      await api(`/api/reviews/accounts/${r.id}/submit`, { method: 'POST' });
    }, 'Submitted to Admin for approval.');
  const approve = () => run(() => api(`/api/reviews/accounts/${r.id}/approve`, { method: 'POST' }), 'Approved.');
  async function sendBack() {
    const ok = await run(() => api(`/api/reviews/accounts/${r.id}/return`, { method: 'POST', json: { reason } }), 'Returned to the Resource Manager.');
    if (ok) {
      setReturnOpen(false);
      setReason('');
    }
  }

  const text = (key: 'summary' | 'risks' | 'opportunities' | 'actions', label: string, hint?: string) => (
    <Field label={label} error={errors[key]} hint={editable ? hint : undefined} required={editable && key === 'summary'}>
      {editable ? (
        <textarea className="input min-h-[72px]" value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      ) : (
        <p className="whitespace-pre-wrap text-sm text-ink">{form[key] || <span className="text-ink3">—</span>}</p>
      )}
    </Field>
  );

  return (
    <div className="pb-12">
      <PageHeader
        title={r.clientName}
        subtitle={`Account review · ${periodLabel(r.period)}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={showPerformance ? `/reviews?period=${r.period}` : '/reviews/accounts'} className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> {showPerformance ? 'Reviews' : 'Account reviews'}
            </Link>
            {editable && (
              <>
                <button className="btn-ghost" disabled={busy} onClick={save}>
                  Save draft
                </button>
                <button className="btn-primary" disabled={busy} onClick={submit}>
                  <Send className="h-4 w-4" /> Submit for approval
                </button>
              </>
            )}
            {canApprove && r.status === 'submitted' && (
              <>
                <button className="btn-ghost" disabled={busy} onClick={() => setReturnOpen(true)}>
                  <Undo2 className="h-4 w-4" /> Return
                </button>
                <button className="btn-primary" disabled={busy} onClick={approve}>
                  <Check className="h-4 w-4" /> Approve
                </button>
              </>
            )}
          </div>
        }
      />

      <div className="space-y-3 px-6 pt-4">
        {banner && (
          <div
            className={
              banner.tone === 'ok'
                ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                : 'rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
            }
          >
            {banner.text}
          </div>
        )}
        {r.status === 'draft' && <ReturnedNote reason={r.returnedReason} />}
      </div>

      <div className="grid gap-4 px-6 pt-4 lg:grid-cols-3">
        <section className="card space-y-4 p-4 lg:col-span-2">
          <Field label="Account rating" error={errors.rating} required={editable}>
            {editable ? (
              <select className="input w-64" value={form.rating} onChange={(e) => setForm({ ...form, rating: e.target.value })}>
                <option value="">Choose…</option>
                {ACCOUNT_RATINGS.map((x) => (
                  <option key={x} value={x}>
                    {ACCOUNT_RATING_LABELS[x]}
                  </option>
                ))}
              </select>
            ) : (
              <div>
                <RatingBadge value={r.rating} />
              </div>
            )}
          </Field>
          {text('summary', 'Summary', 'How the account stands this month.')}
          {text('risks', 'Risks', 'Roll-offs, renewals due, escalations, unhappy stakeholders.')}
          {text('opportunities', 'Growth opportunities', 'New roles, extensions, other teams.')}
          {text('actions', 'Actions', 'Who does what next.')}
        </section>

        <div className="space-y-4">
          <section className="card space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-ink">Status</h2>
              <ReviewStatusBadge value={r.status} />
            </div>
            <dl className="space-y-1 text-ink2">
              <div>
                Submitted: {r.submittedAt ? `${formatDate(r.submittedAt)}${r.submittedByName ? ` by ${r.submittedByName}` : ''}` : '—'}
              </div>
              <div>
                Approved: {r.approvedAt ? `${formatDate(r.approvedAt)}${r.approvedByName ? ` by ${r.approvedByName}` : ''}` : '—'}
              </div>
            </dl>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold text-ink">Rating, last six months</h2>
            {r.history.length === 0 ? (
              <p className="text-ink3">No reviews yet.</p>
            ) : (
              <ul className="space-y-1">
                {r.history.map((h) => (
                  <li key={h.period} className="flex items-center justify-between gap-2">
                    <span className={h.period === r.period ? 'font-medium text-ink' : 'text-ink2'}>{periodLabel(h.period)}</span>
                    <RatingBadge value={h.rating} short />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <section className="px-6 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Deployed this month ({r.resources.length})</h2>
        <div className="card overflow-hidden">
          {r.resources.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink3">Nobody was deployed at this client this month.</p>
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Resource</th>
                  <th className="th">Project</th>
                  {showPerformance && <th className="th text-right">Average</th>}
                  {showPerformance && <th className="th">Performance review</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.resources.map((x, i) => (
                  <tr key={`${x.resourceName}-${x.projectName}-${i}`}>
                    <td className="td font-medium text-ink">{x.resourceName}</td>
                    <td className="td">{x.projectName}</td>
                    {showPerformance && (
                      <td className="td text-right">
                        <ScoreValue value={x.average} />
                      </td>
                    )}
                    {showPerformance && (
                      <td className="td">
                        {x.reviewId !== null ? (
                          <Link href={`/reviews/performance/${x.reviewId}`} className="hover:underline">
                            <ReviewStatusBadge value={x.status} />
                          </Link>
                        ) : (
                          <ReviewStatusBadge value={null} />
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </section>

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Return for changes" description="The review goes back to draft so the Resource Manager can change it.">
        <div className="space-y-4">
          <Field label="What needs to change" error={errors.reason} required>
            <textarea className="input min-h-[96px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setReturnOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || !reason.trim()} onClick={sendBack}>
              Return
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
