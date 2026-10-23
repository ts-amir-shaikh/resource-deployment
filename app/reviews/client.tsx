'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, ListChecks, MessageSquareQuote } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import type { CriterionRow, Tracker } from '@/lib/reviews';
import type { Completion } from '@/lib/review-rules';
import { Badge, EmptyState, Field, Modal, PageHeader, Stat, TableShell } from '@/components/ui';
import { PeriodSwitcher, RatingBadge, ReviewStatusBadge, ScoreValue } from '@/components/review-ui';

function completionSub(c: Completion): string {
  if (c.due === 0) return 'Nothing due';
  return `${c.notStarted} not started · ${c.draft} draft · ${c.submitted} submitted`;
}

export default function ReviewsClient({
  tracker,
  criteria,
  canWrite,
}: {
  tracker: Tracker;
  criteria: CriterionRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [criteriaOpen, setCriteriaOpen] = useState(false);

  async function start(kind: 'performance' | 'accounts', key: number) {
    setBusy(`${kind}:${key}`);
    setBanner(null);
    try {
      const body = kind === 'performance' ? { deploymentId: key, period: tracker.period } : { clientId: key, period: tracker.period };
      const row = await api<{ id: number }>(`/api/reviews/${kind}`, { method: 'POST', json: body });
      router.push(`/reviews/${kind}/${row.id}`);
    } catch (e) {
      setBanner(errorMessage(e));
      setBusy(null);
    }
  }

  const { performanceCompletion: pc, accountCompletion: ac } = tracker;

  return (
    <div className="pb-12">
      <PageHeader
        title="Reviews"
        subtitle="Monthly account and performance reviews — submitted by the Resource Manager, approved by Admin"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodSwitcher period={tracker.period} basePath="/reviews" />
            <Link href="/reviews/accounts" className="btn-ghost">
              <ClipboardList className="h-4 w-4" /> All account reviews
            </Link>
            <button className="btn-ghost" onClick={() => setCriteriaOpen(true)}>
              <ListChecks className="h-4 w-4" /> Criteria
            </button>
          </div>
        }
      />

      {banner && (
        <div className="mx-6 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {banner}
        </div>
      )}

      <div className="grid gap-3 px-6 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Account reviews approved" value={`${ac.approved} / ${ac.due}`} sub={completionSub(ac)} tone={ac.due > 0 && ac.approved === ac.due ? 'good' : 'default'} info="Clients with at least one deployment active this month, and how many of their reviews Admin has approved." />
        <Stat label="Performance reviews approved" value={`${pc.approved} / ${pc.due}`} sub={completionSub(pc)} tone={pc.due > 0 && pc.approved === pc.due ? 'good' : 'default'} info="Deployments active on any day of this month, and how many of their reviews Admin has approved." />
        <Stat label="Waiting for Admin" value={ac.submitted + pc.submitted} sub="Submitted, not yet approved" tone={ac.submitted + pc.submitted > 0 ? 'warn' : 'default'} />
        <Stat label="Not started" value={ac.notStarted + pc.notStarted} sub="Due this month with no review yet" tone={ac.notStarted + pc.notStarted > 0 ? 'warn' : 'default'} />
      </div>

      <section className="px-6 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Account reviews</h2>
        <div className="card overflow-hidden">
          {tracker.accounts.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No account reviews due" description="An account review is due for every client with a deployment active this month." />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Client</th>
                  <th className="th text-right">Deployed</th>
                  <th className="th">Rating</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tracker.accounts.map((a) => (
                  <tr key={a.clientId} className="hover:bg-surface2/50">
                    <td className="td font-medium text-ink">{a.clientName}</td>
                    <td className="td tnum text-right">{a.deployed}</td>
                    <td className="td">
                      <RatingBadge value={a.rating} short />
                    </td>
                    <td className="td">
                      <ReviewStatusBadge value={a.status} />
                    </td>
                    <td className="td text-right">
                      {a.reviewId !== null ? (
                        <Link href={`/reviews/accounts/${a.reviewId}`} className="btn-ghost">
                          Open
                        </Link>
                      ) : canWrite ? (
                        <button className="btn-primary" disabled={busy !== null} onClick={() => start('accounts', a.clientId)}>
                          {busy === `accounts:${a.clientId}` ? 'Starting…' : 'Start review'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </section>

      <section className="px-6 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-ink">Performance reviews</h2>
        <div className="card overflow-hidden">
          {tracker.performance.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No performance reviews due" description="A performance review is due for every deployment active on any day of the month." />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Resource</th>
                  <th className="th">Client · Project</th>
                  <th className="th text-right">Average</th>
                  <th className="th">Status</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {tracker.performance.map((p) => (
                  <tr key={p.deploymentId} className="hover:bg-surface2/50">
                    <td className="td">
                      <div className="font-medium text-ink">{p.resourceName}</div>
                      {p.designation && <div className="text-xs text-ink3">{p.designation}</div>}
                    </td>
                    <td className="td">
                      {p.clientName}
                      <div className="text-xs text-ink3">
                        {p.projectName}
                        {p.deploymentType === 'shadow' ? ' · shadow' : ''}
                      </div>
                    </td>
                    <td className="td text-right">
                      <ScoreValue value={p.average} />
                    </td>
                    <td className="td">
                      <span className="flex items-center gap-1.5">
                        <ReviewStatusBadge value={p.status} />
                        {p.clientFeedback && (
                          <span title="Client feedback recorded" className="text-ink3">
                            <MessageSquareQuote className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="td text-right">
                      {p.reviewId !== null ? (
                        <Link href={`/reviews/performance/${p.reviewId}`} className="btn-ghost">
                          Open
                        </Link>
                      ) : canWrite ? (
                        <button className="btn-primary" disabled={busy !== null} onClick={() => start('performance', p.deploymentId)}>
                          {busy === `performance:${p.deploymentId}` ? 'Starting…' : 'Start review'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </section>

      <CriteriaModal open={criteriaOpen} onClose={() => setCriteriaOpen(false)} criteria={criteria} canWrite={canWrite} />
    </div>
  );
}

/** Q7: the performance criteria. Retire and restore; never delete. */
function CriteriaModal({
  open,
  onClose,
  criteria,
  canWrite,
}: {
  open: boolean;
  onClose: () => void;
  criteria: CriterionRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setBanner(null);
    setErrors({});
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const ok = await run(() => api('/api/reviews/criteria', { method: 'POST', json: { label, description } }));
    if (ok) {
      setLabel('');
      setDescription('');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Review criteria" description="What each performance review is scored on, 1 to 5. A retired criterion is no longer asked; past scores against it stay.">
      <div className="space-y-4">
        {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
        <ul className="divide-y divide-line rounded-lg border border-line">
          {criteria.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className={c.active ? 'text-sm font-medium text-ink' : 'text-sm text-ink3 line-through'}>{c.label}</div>
                {c.description && <div className="text-xs text-ink3">{c.description}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!c.active && <Badge>Retired</Badge>}
                {canWrite && (
                  <button
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => run(() => api(`/api/reviews/criteria/${c.id}`, { method: 'PUT', json: { active: !c.active } }))}
                  >
                    {c.active ? 'Retire' : 'Restore'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {canWrite && (
          <div className="space-y-3 border-t border-line pt-4">
            <Field label="New criterion" error={errors.label} required>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Ownership" />
            </Field>
            <Field label="What it means" error={errors.description}>
              <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={busy || !label.trim()} onClick={add}>
                Add criterion
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
