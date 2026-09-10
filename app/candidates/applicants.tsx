'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Inbox,
  Phone,
  PhoneOff,
  PhoneCall,
  UserPlus,
  X,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { formatDate, formatMoneyCompact } from '@/lib/utils';
import { Badge, PageHeader, Field, Modal, EmptyState, type Tone } from '@/components/ui';
import type { Role } from '@/lib/auth';
import type { ApplicationRow } from '@/lib/queries';

const CONTACT_LABELS: Record<string, string> = {
  not_contacted: 'Not called',
  attempted: 'Tried, no answer',
  reached: 'Spoke to them',
  unreachable: 'Unreachable',
};

const CONTACT_TONE: Record<string, Tone> = {
  not_contacted: 'neutral',
  attempted: 'amber',
  reached: 'green',
  unreachable: 'rose',
};

type Decision = 'all' | 'new' | 'accepted' | 'dismissed';

/**
 * Everything the public job page has brought in, as a queue somebody works
 * through — rather than something you only find by opening the one requirement
 * it was submitted against.
 *
 * The default view is what is still waiting for a decision. Accepted and
 * dismissed are one click away rather than the landing state: a queue that
 * opens on work already done is not a queue.
 */
export default function ApplicantsClient({
  applications,
  role,
  waiting,
}: {
  applications: ApplicationRow[];
  role: Role;
  waiting: number;
}) {
  const router = useRouter();
  const readOnly = role === 'management';

  const [decision, setDecision] = useState<Decision>('new');
  const [kind, setKind] = useState<'all' | 'application' | 'referral'>('all');
  const [uncalledOnly, setUncalledOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [callFor, setCallFor] = useState<ApplicationRow | null>(null);
  const [callForm, setCallForm] = useState({ contactStatus: 'attempted', contactNote: '' });
  const [callBusy, setCallBusy] = useState(false);

  const counts = useMemo(
    () => ({
      all: applications.length,
      new: applications.filter((a) => a.status === 'new').length,
      accepted: applications.filter((a) => a.status === 'accepted').length,
      dismissed: applications.filter((a) => a.status === 'dismissed').length,
    }),
    [applications],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((a) => {
      if (decision !== 'all' && a.status !== decision) return false;
      if (kind !== 'all' && a.kind !== kind) return false;
      if (uncalledOnly && a.contactStatus !== 'not_contacted') return false;
      if (!q) return true;
      return (
        a.candidateName.toLowerCase().includes(q) ||
        (a.candidateEmail ?? '').toLowerCase().includes(q) ||
        (a.candidateMobile ?? '').toLowerCase().includes(q) ||
        a.requirementTitle.toLowerCase().includes(q)
      );
    });
  }, [applications, decision, kind, uncalledOnly, search]);

  async function decide(a: ApplicationRow, action: 'accept' | 'dismiss') {
    setBusy(a.id);
    setError(null);
    try {
      await api(`/api/referrals/${a.id}`, {
        method: 'PATCH',
        json: { action, mapToOpportunity: action === 'accept' },
      });
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  function openCall(a: ApplicationRow) {
    setCallFor(a);
    setError(null);
    setCallForm({
      contactStatus: a.contactStatus === 'not_contacted' ? 'attempted' : a.contactStatus,
      contactNote: a.contactNote ?? '',
    });
  }

  async function saveCall() {
    if (!callFor) return;
    setCallBusy(true);
    setError(null);
    try {
      await api(`/api/referrals/${callFor.id}/contact`, { method: 'PATCH', json: callForm });
      setCallFor(null);
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCallBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Applicants"
        subtitle={
          waiting === 0
            ? 'Nothing waiting for a decision.'
            : `${waiting} waiting for a decision before they join the pool`
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search name, email, requirement…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['new', 'accepted', 'dismissed', 'all'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDecision(d)}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                decision === d ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {d === 'new' ? 'Waiting' : d}
              <span className="ml-1.5 opacity-60">{counts[d]}</span>
            </button>
          ))}
        </div>

        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['all', 'application', 'referral'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                kind === k ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {k === 'all' ? 'All' : k === 'application' ? 'Applied' : 'Referred'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setUncalledOnly(!uncalledOnly)}
          className={`chip border transition-colors ${
            uncalledOnly
              ? 'border-brand bg-brandbg text-brand'
              : 'border-line bg-surface text-ink2 hover:bg-surface2'
          }`}
        >
          <Phone className="h-3 w-3" /> Nobody has called yet
        </button>
      </div>

      {error && (
        <p className="mx-6 mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="px-6 pb-12">
        {rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Inbox}
              title={decision === 'new' ? 'Nothing waiting' : 'Nothing here'}
              description={
                decision === 'new'
                  ? 'Applications from the public job page land here for review before anyone joins the candidate pool.'
                  : 'Try a different filter.'
              }
            />
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => (
              <li key={a.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">
                        {a.candidateName}
                      </span>
                      {a.kind === 'application' ? (
                        <Badge tone="blue">Applied</Badge>
                      ) : (
                        <Badge tone="violet">Referred</Badge>
                      )}
                      {a.status === 'new' && <Badge tone="amber">Waiting</Badge>}
                      {a.status === 'accepted' && <Badge tone="green">In pool</Badge>}
                      {a.status === 'dismissed' && <Badge tone="neutral">Dismissed</Badge>}
                      <Badge tone={CONTACT_TONE[a.contactStatus]}>
                        {CONTACT_LABELS[a.contactStatus]}
                      </Badge>
                    </div>

                    <div className="mt-1 text-xs text-ink2">
                      for{' '}
                      <Link
                        href={`/pipeline/${a.opportunityId}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {a.requirementTitle}
                      </Link>{' '}
                      <span className="text-ink3">
                        · {a.companyName}
                        {a.ownerName && ` · ${a.ownerName}`}
                      </span>
                    </div>

                    <div className="tnum mt-1 text-2xs text-ink3">
                      {[a.candidateEmail, a.candidateMobile].filter(Boolean).join(' · ') ||
                        'No contact details given'}
                    </div>

                    <div className="tnum mt-0.5 text-2xs text-ink3">
                      {[
                        a.experienceYears !== null && `${a.experienceYears} yrs`,
                        a.noticePeriodDays !== null && `${a.noticePeriodDays}d notice`,
                        a.currentCtc !== null &&
                          `current ${formatMoneyCompact(a.currentCtc, 'INR')}`,
                        a.expectedCtc !== null &&
                          `expected ${formatMoneyCompact(a.expectedCtc, 'INR')}`,
                      ]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </div>

                    {a.kind === 'referral' || a.referrerName !== a.candidateName ? (
                      <div className="mt-0.5 text-2xs text-ink3">
                        Referred by {a.referrerName}
                        {a.referrerEmail && ` · ${a.referrerEmail}`}
                      </div>
                    ) : null}
                  </div>

                  <div className="tnum shrink-0 text-2xs text-ink3">
                    {formatDate(a.createdAt.slice(0, 10))}
                  </div>
                </div>

                {/* The reason this screen exists: knowing before you dial. Only
                    while a decision is still pending — on an accepted row
                    "already in the pool" is just describing the acceptance. */}
                {a.status === 'new' && (a.alreadyInPool || a.otherApplications > 0) && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-2xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {a.alreadyInPool && <span>Already in the candidate pool.</span>}
                    {a.otherApplications > 0 && (
                      <span>
                        Applied to {a.otherApplications} other role
                        {a.otherApplications === 1 ? '' : 's'}.
                      </span>
                    )}
                  </div>
                )}

                {a.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-ink2">
                    {a.notes}
                  </p>
                )}

                {a.contactNote && (
                  <p className="mt-2 rounded-md bg-surface2 px-3 py-1.5 text-2xs text-ink2">
                    <span className="font-medium">Call note</span>
                    {a.contactedByName && ` · ${a.contactedByName}`}
                    {a.lastContactedAt && ` · ${formatDate(a.lastContactedAt)}`}
                    <br />
                    {a.contactNote}
                  </p>
                )}

                {!readOnly && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="btn-ghost px-2 py-1 text-xs"
                      onClick={() => openCall(a)}
                    >
                      <PhoneCall className="h-3.5 w-3.5" /> Log a call
                    </button>
                    {a.status === 'new' && (
                      <>
                        <button
                          className="btn px-2 py-1 text-xs"
                          onClick={() => decide(a, 'accept')}
                          disabled={busy === a.id}
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Add to pool
                        </button>
                        <button
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={() => decide(a, 'dismiss')}
                          disabled={busy === a.id}
                        >
                          <X className="h-3.5 w-3.5" /> Dismiss
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        open={callFor !== null}
        onClose={() => setCallFor(null)}
        title={callFor ? `Call · ${callFor.candidateName}` : 'Log a call'}
        description="Recording the call is separate from deciding about them — one does not imply the other."
      >
        <div className="space-y-4">
          <Field label="How did it go?" required>
            <select
              className="input"
              value={callForm.contactStatus}
              onChange={(e) =>
                setCallForm({ ...callForm, contactStatus: e.target.value })
              }
            >
              {(['attempted', 'reached', 'unreachable', 'not_contacted'] as const).map(
                (v) => (
                  <option key={v} value={v}>
                    {v === 'not_contacted' ? 'Reset — nobody has called' : CONTACT_LABELS[v]}
                  </option>
                ),
              )}
            </select>
          </Field>

          <Field
            label="Note"
            hint="What they said, when to try again — whatever the next person needs."
          >
            <textarea
              rows={4}
              className="input"
              value={callForm.contactNote}
              onChange={(e) => setCallForm({ ...callForm, contactNote: e.target.value })}
            />
          </Field>

          {callForm.contactStatus === 'not_contacted' && (
            <p className="flex items-start gap-2 rounded-md border border-line bg-surface2 px-3 py-2 text-2xs text-ink2">
              <PhoneOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              This clears who called and when, so the record does not contradict itself.
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setCallFor(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={saveCall} disabled={callBusy}>
            Save
          </button>
        </div>
      </Modal>
    </>
  );
}
