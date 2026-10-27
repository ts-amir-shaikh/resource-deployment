'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, CopyPlus, Plus, RotateCcw, Send, Undo2, X } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import type { PerformanceReviewDetail } from '@/lib/reviews';
import {
  averageScore,
  isReviewEditable,
  extraLabelKey,
  EXTRA_LABEL_MAX,
  MAX_EXTRA_SCORES,
  MAX_SCORE,
  periodLabel,
  SCORE_LABELS,
} from '@/lib/review-rules';
import { coverageLabel } from '@/lib/timesheet-rules';
import { Field, Modal, PageHeader, TableShell } from '@/components/ui';
import { ChangeNoteField, LockedNote, ReturnedNote, ReviewStatusBadge, ScorePicker, ScoreValue, VersionHistory } from '@/components/review-ui';

type ScoreState = Record<number, { score: number | null; note: string }>;

function initialScores(r: PerformanceReviewDetail): ScoreState {
  const out: ScoreState = {};
  for (const c of r.criteria) out[c.id] = { score: null, note: '' };
  for (const s of r.scores) out[s.criterionId] = { score: s.score, note: s.note ?? '' };
  return out;
}

/** An extra criterion on screen. `key` only identifies the row while it is being edited. */
type ExtraState = { key: number; label: string; description: string; score: number | null; note: string };

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
  // A version already exists, so submitting again makes the next one and has to say what changed.
  const nextVersion = r.versions.length > 0 ? r.versions[0].version + 1 : 1;
  const needsNote = r.versions.length > 0;
  const [form, setForm] = useState({
    summary: r.summary ?? '',
    strengths: r.strengths ?? '',
    improvements: r.improvements ?? '',
    clientFeedback: r.clientFeedback ?? '',
    clientFeedbackBy: r.clientFeedbackBy ?? '',
    clientFeedbackDate: r.clientFeedbackDate ?? '',
  });
  const [scores, setScores] = useState<ScoreState>(() => initialScores(r));
  const [extras, setExtras] = useState<ExtraState[]>(() =>
    r.extraScores.map((e, i) => ({ key: i, label: e.label, description: e.description ?? '', score: e.score, note: e.note ?? '' })),
  );
  const [nextKey, setNextKey] = useState(r.extraScores.length);
  const [adding, setAdding] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [addError, setAddError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'return' | 'reopen' | null>(null);
  const [reason, setReason] = useState('');
  const [changeNote, setChangeNote] = useState('');

  // Extra criteria count in the average, the same as the standard ones.
  const liveAverage = averageScore([...Object.values(scores).map((s) => s.score), ...extras.map((e) => e.score)]);
  const shownAverage = editable ? liveAverage : r.average;
  const firstName = r.resourceName.split(' ')[0];
  const unscoredExtras = extras.filter((e) => e.score === null).length;
  // Last month's extras not already on this review, to offer in one click.
  const copyable = r.previousExtras.filter((p) => !extras.some((e) => extraLabelKey(e.label) === extraLabelKey(p.label)));
  const roomForMore = extras.length < MAX_EXTRA_SCORES;

  function payload() {
    return {
      ...form,
      scores: Object.entries(scores).map(([criterionId, s]) => ({ criterionId: Number(criterionId), score: s.score ?? '', note: s.note })),
      extraScores: extras.map((e) => ({ label: e.label, description: e.description, score: e.score ?? '', note: e.note })),
    };
  }

  function addExtra(label: string, description = '') {
    const key = extraLabelKey(label);
    if (!key) return setAddError('Give the criterion a name.');
    if (key.length > EXTRA_LABEL_MAX) return setAddError(`Keep it under ${EXTRA_LABEL_MAX} characters.`);
    if ([...r.criteria.map((c) => c.label), ...extras.map((e) => e.label)].some((l) => extraLabelKey(l) === key)) {
      return setAddError('That criterion is already on this review.');
    }
    setExtras((list) => [...list, { key: nextKey, label: label.trim(), description: description.trim(), score: null, note: '' }]);
    setNextKey(nextKey + 1);
    setDraftLabel('');
    setDraftDescription('');
    setAddError('');
    setAdding(false);
  }

  function copyLastMonth() {
    const room = MAX_EXTRA_SCORES - extras.length;
    const add = copyable.slice(0, room);
    setExtras((list) => [...list, ...add.map((p, i) => ({ key: nextKey + i, label: p.label, description: p.description ?? '', score: null, note: '' }))]);
    setNextKey(nextKey + add.length);
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
  const submit = () => {
    if (needsNote && !changeNote.trim()) {
      setBanner({ tone: 'error', text: 'Say what changed before submitting.' });
      setErrors({ changeNote: 'Say what changed since the last version.' });
      return Promise.resolve(false);
    }
    return run(async () => {
      await api(`/api/reviews/performance/${r.id}`, { method: 'PUT', json: payload() });
      await api(`/api/reviews/performance/${r.id}/submit`, { method: 'POST', json: { changeNote } });
    }, 'Locked and sent to Admin for approval.');
  };
  const approve = () => run(() => api(`/api/reviews/performance/${r.id}/approve`, { method: 'POST' }), 'Approved.');
  async function sendBack() {
    const kind = dialog;
    if (!kind) return;
    const ok = await run(
      () => api(`/api/reviews/performance/${r.id}/${kind}`, { method: 'POST', json: { reason } }),
      kind === 'return' ? 'Returned to the Resource Manager.' : 'Reopened. The Resource Manager can now update it.',
    );
    if (ok) {
      setDialog(null);
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
            {editable && r.status === 'draft' && (
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
                <button className="btn-ghost" disabled={busy} onClick={() => setDialog('return')}>
                  <Undo2 className="h-4 w-4" /> Return
                </button>
                <button className="btn-primary" disabled={busy} onClick={approve}>
                  <Check className="h-4 w-4" /> Approve
                </button>
              </>
            )}
            {canApprove && r.status === 'approved' && (
              <button className="btn-ghost" disabled={busy} onClick={() => setDialog('reopen')}>
                <RotateCcw className="h-4 w-4" /> Reopen
              </button>
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
          {editable && needsNote && <ChangeNoteField value={changeNote} onChange={setChangeNote} error={errors.changeNote} nextVersion={nextVersion} />}
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink">Scores</h2>
              <span className="flex items-center gap-2 text-sm text-ink2">
                Average <ScoreValue value={shownAverage} />
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-surface2" aria-hidden>
                  <span
                    className={
                      shownAverage === null
                        ? 'block h-full w-0'
                        : shownAverage >= 4
                          ? 'block h-full bg-emerald-500'
                          : shownAverage < 3
                            ? 'block h-full bg-rose-500'
                            : 'block h-full bg-brand'
                    }
                    style={{ width: `${shownAverage === null ? 0 : (shownAverage / MAX_SCORE) * 100}%` }}
                  />
                </span>
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

            {(extras.length > 0 || editable) && (
              <div className="mt-2 border-t border-line pt-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink2">
                      Added for {firstName} · {periodLabel(r.period)} only
                    </h3>
                    <p className="text-2xs text-ink3">Counts in this review&apos;s average. Not added to anyone else&apos;s review or to next month.</p>
                  </div>
                  {editable && copyable.length > 0 && roomForMore && (
                    <button type="button" className="btn-ghost text-xs" onClick={copyLastMonth}>
                      <CopyPlus className="h-3.5 w-3.5" /> Copy last month&apos;s ({copyable.length})
                    </button>
                  )}
                </div>

                {extras.length === 0 && !adding && <p className="py-2 text-xs text-ink3">None added this month.</p>}

                <ul className="divide-y divide-line">
                  {extras.map((e) => (
                    <li key={e.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium text-ink">
                          {e.label}
                          <span className="rounded-full bg-brandbg px-2 py-0.5 text-2xs font-normal text-brand">This month only</span>
                          {editable && (
                            <button
                              type="button"
                              className="rounded-md p-1 text-ink3 hover:bg-surface2 hover:text-rose-600"
                              aria-label={`Remove ${e.label}`}
                              title="Remove from this review"
                              onClick={() => setExtras(extras.filter((x) => x.key !== e.key))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {e.description && <div className="text-xs text-ink3">{e.description}</div>}
                        {editable ? (
                          <input
                            className="input mt-2"
                            placeholder="Note (optional)"
                            value={e.note}
                            onChange={(ev) => setExtras(extras.map((x) => (x.key === e.key ? { ...x, note: ev.target.value } : x)))}
                          />
                        ) : (
                          e.note && <p className="mt-1 text-xs text-ink2">{e.note}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <ScorePicker
                          label={e.label}
                          value={e.score}
                          disabled={!editable}
                          onChange={(v) => setExtras(extras.map((x) => (x.key === e.key ? { ...x, score: v } : x)))}
                        />
                        <span className="text-2xs text-ink3">{e.score !== null ? SCORE_LABELS[e.score] : 'Not scored'}</span>
                      </div>
                    </li>
                  ))}
                </ul>

                {editable && adding && (
                  <form
                    className="mt-2 space-y-2 rounded-md border border-line bg-surface p-3"
                    onSubmit={(ev) => {
                      ev.preventDefault();
                      addExtra(draftLabel, draftDescription);
                    }}
                  >
                    <Field label="Criterion" error={addError} required hint="For example: Mentoring, Ownership, On-call support">
                      <input
                        className="input"
                        autoFocus
                        maxLength={EXTRA_LABEL_MAX}
                        value={draftLabel}
                        onChange={(ev) => {
                          setDraftLabel(ev.target.value);
                          setAddError('');
                        }}
                      />
                    </Field>
                    <Field label="What it measures (optional)">
                      <input className="input" maxLength={200} value={draftDescription} onChange={(ev) => setDraftDescription(ev.target.value)} />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => {
                          setAdding(false);
                          setAddError('');
                          setDraftLabel('');
                          setDraftDescription('');
                        }}
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn-primary" disabled={!draftLabel.trim()}>
                        Add criterion
                      </button>
                    </div>
                  </form>
                )}

                {editable && !adding && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button type="button" className="btn-ghost text-xs" disabled={!roomForMore} onClick={() => setAdding(true)}>
                      <Plus className="h-3.5 w-3.5" /> Add a criterion for this month
                    </button>
                    {!roomForMore && <span className="text-2xs text-ink3">Up to {MAX_EXTRA_SCORES} on one review.</span>}
                    {unscoredExtras > 0 && (
                      <span className="text-2xs text-amber-700 dark:text-amber-300">
                        {unscoredExtras} to score before this can be submitted.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
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

          <VersionHistory versions={r.versions} />
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
            {r.status !== 'draft' && <LockedNote />}
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
                      {h.extraCount > 0 && (
                        <span className="ml-1 text-2xs text-ink3" title={`Includes ${h.extraCount} extra ${h.extraCount === 1 ? 'criterion' : 'criteria'} added to that review`}>
                          +{h.extraCount}
                        </span>
                      )}
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

      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === 'reopen' ? 'Reopen this review' : 'Return for changes'}
        description={
          dialog === 'reopen'
            ? 'It goes back to a draft. The Resource Manager updates it and says what changed, and it is saved as a new version.'
            : 'The review goes back to draft so the Resource Manager can change it.'
        }
      >
        <div className="space-y-4">
          <Field label={dialog === 'reopen' ? 'Why is it being reopened' : 'What needs to change'} error={errors.reason} required>
            <textarea className="input min-h-[96px]" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button className="btn-primary" disabled={busy || !reason.trim()} onClick={sendBack}>
              {dialog === 'reopen' ? 'Reopen' : 'Return'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
