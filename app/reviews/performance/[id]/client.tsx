'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Send, Undo2 } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import type { PerformanceReviewDetail } from '@/lib/reviews';
import { averageScore, isReviewEditable, periodLabel, SCORE_LABELS } from '@/lib/review-rules';
import { coverageLabel } from '@/lib/timesheet-rules';
import { Field, Modal, PageHeader, TableShell } from '@/components/ui';
import { ReturnedNote, ReviewStatusBadge, ScorePicker, ScoreValue } from '@/components/review-ui';

type ScoreState = Record<number, { score: number | null; note: string }>;

function initialScores(r: PerformanceReviewDetail): ScoreState {
  const out: ScoreState = {};
  for (const c of r.criteria) out[c.id] = { score: null, note: '' };
  for (const s of r.scores) out[s.criterionId] = { score: s.score, note: s.note ?? '' };
  return out;
}

export default function PerformanceReviewClient({
  review: r,
  canEdit,
  canApprove,
}: {
  review: PerformanceReviewDetail;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const editable = canEdit && isReviewEditable(r.status);
  const [form, setForm] = useState({
    summary: r.summary ?? '',
    strengths: r.strengths ?? '',
    improvements: r.improvements ?? '',
    clientFeedback: r.clientFeedback ?? '',
    clientFeedbackBy: r.clientFeedbackBy ?? '',
    clientFeedbackDate: r.clientFeedbackDate ?? '',
  });
  const [scores, setScores] = useState<ScoreState>(() => initialScores(r));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [reason, setReason] = useState('');

  const liveAverage = averageScore(Object.values(scores).map((s) => s.score));

  function payload() {
    return {
      ...form,
      scores: Object.entries(scores).map(([criterionId, s]) => ({ criterionId: Number(criterionId), score: s.score ?? '', note: s.note })),
    };
  }

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

  const save = () => run(() => api(`/api/reviews/performance/${r.id}`, { method: 'PUT', json: payload() }), 'Saved.');
  // Submitting saves first, so what Admin sees is what is on screen.
  const submit = () =>
    run(async () => {
      await api(`/api/reviews/performance/${r.id}`, { method: 'PUT', json: payload() });
      await api(`/api/reviews/performance/${r.id}/submit`, { method: 'POST' });
    }, 'Submitted to Admin for approval.');
  const approve = () => run(() => api(`/api/reviews/performance/${r.id}/approve`, { method: 'POST' }), 'Approved.');
  async function sendBack() {
    const ok = await run(() => api(`/api/reviews/performance/${r.id}/return`, { method: 'POST', json: { reason } }), 'Returned to the Resource Manager.');
    if (ok) {
      setReturnOpen(false);
      setReason('');
    }
  }

  const text = (key: keyof typeof form, label: string, hint?: string) => (
    <Field label={label} error={errors[key]} hint={editable ? hint : undefined}>
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
        title={r.resourceName}
        subtitle={`Performance review · ${periodLabel(r.period)} · ${r.clientName}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/reviews?period=${r.period}`} className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Reviews
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
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Scores</h2>
              <span className="text-sm text-ink2">
                Average <ScoreValue value={editable ? liveAverage : r.average} />
              </span>
            </div>
            <ul className="divide-y divide-line">
              {r.criteria.map((c) => {
                const s = scores[c.id] ?? { score: null, note: '' };
                return (
                  <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-ink">
                        {c.label}
                        {!c.active && <span className="ml-2 text-xs font-normal text-ink3">(retired)</span>}
                      </div>
                      {c.description && <div className="text-xs text-ink3">{c.description}</div>}
                      {editable ? (
                        <input
                          className="input mt-2"
                          placeholder="Note (optional)"
                          value={s.note}
                          onChange={(e) => setScores({ ...scores, [c.id]: { ...s, note: e.target.value } })}
                        />
                      ) : (
                        s.note && <p className="mt-1 text-xs text-ink2">{s.note}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <ScorePicker
                        label={c.label}
                        value={s.score}
                        disabled={!editable}
                        onChange={(v) => setScores({ ...scores, [c.id]: { ...s, score: v } })}
                      />
                      <span className="text-2xs text-ink3">{s.score !== null ? SCORE_LABELS[s.score] : 'Not scored'}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card space-y-4 p-4">
            <h2 className="text-sm font-semibold text-ink">Review</h2>
            {text('summary', 'Summary', 'How the month went, in a few lines.')}
            {text('strengths', 'Strengths')}
            {text('improvements', 'To improve')}
          </section>

          <section className="card space-y-4 p-4">
            <div>
              <h2 className="text-sm font-semibold text-ink">Client feedback</h2>
              <p className="text-xs text-ink3">Recorded on the client&apos;s behalf. The client has no login (D13).</p>
            </div>
            {text('clientFeedback', 'What the client said')}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Given by" error={errors.clientFeedbackBy} hint={editable ? 'Name and role at the client' : undefined}>
                {editable ? (
                  <input className="input" value={form.clientFeedbackBy} onChange={(e) => setForm({ ...form, clientFeedbackBy: e.target.value })} />
                ) : (
                  <p className="text-sm text-ink">{form.clientFeedbackBy || <span className="text-ink3">—</span>}</p>
                )}
              </Field>
              <Field label="On" error={errors.clientFeedbackDate}>
                {editable ? (
                  <input type="date" className="input" value={form.clientFeedbackDate} onChange={(e) => setForm({ ...form, clientFeedbackDate: e.target.value })} />
                ) : (
                  <p className="text-sm text-ink">{formatDate(form.clientFeedbackDate || null)}</p>
                )}
              </Field>
            </div>
          </section>
        </div>

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

          <section className="card space-y-1 p-4 text-sm">
            <h2 className="mb-1 font-semibold text-ink">Engagement</h2>
            <div className="text-ink">{r.clientName}</div>
            <div className="text-ink2">{r.projectName}</div>
            {r.designation && <div className="text-ink2">{r.designation}</div>}
            <div className="text-ink3">
              {formatDate(r.startDate)} – {r.endDate ? formatDate(r.endDate) : 'ongoing'}
            </div>
          </section>

          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold text-ink">Timesheet this month</h2>
            {r.timesheet.expectedDays === 0 ? (
              <p className="text-ink3">No working days in this month for this deployment.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-y-1 text-ink2">
                <dt>Approved</dt>
                <dd className="tnum text-right text-ink">{coverageLabel(r.timesheet)}</dd>
                <dt>Worked</dt>
                <dd className="tnum text-right text-ink">{r.timesheet.workedDays}</dd>
                <dt>Paid leave</dt>
                <dd className="tnum text-right text-ink">{r.timesheet.paidLeaveDays}</dd>
                <dt>Unpaid leave</dt>
                <dd className="tnum text-right text-ink">{r.timesheet.unpaidLeaveDays}</dd>
              </dl>
            )}
            <p className="mt-2 text-2xs text-ink3">Approved timesheet days only (M65).</p>
          </section>
        </div>
      </div>

      <section className="px-6 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Last six months (G-RM-07)</h2>
        <div className="card overflow-hidden">
          {r.history.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink3">No reviews yet.</p>
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Month</th>
                  <th className="th">Client</th>
                  {r.criteria.map((c) => (
                    <th key={c.id} className="th text-right">
                      {c.label}
                    </th>
                  ))}
                  <th className="th text-right">Average</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {r.history.map((h) => (
                  <tr key={h.reviewId} className={h.reviewId === r.id ? 'bg-brandbg/40' : 'hover:bg-surface2/50'}>
                    <td className="td">
                      {h.reviewId === r.id ? (
                        periodLabel(h.period)
                      ) : (
                        <Link href={`/reviews/performance/${h.reviewId}`} className="hover:underline">
                          {periodLabel(h.period)}
                        </Link>
                      )}
                    </td>
                    <td className="td">{h.clientName}</td>
                    {r.criteria.map((c) => (
                      <td key={c.id} className="td tnum text-right">
                        {h.scores[c.id] ?? <span className="text-ink3">—</span>}
                      </td>
                    ))}
                    <td className="td text-right">
                      <ScoreValue value={h.average} />
                    </td>
                    <td className="td">
                      <ReviewStatusBadge value={h.status} />
                    </td>
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
