'use client';

import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, type Tone } from '@/components/ui';
import {
  ACCOUNT_RATING_LABELS,
  MAX_SCORE,
  MIN_SCORE,
  REVIEW_STATUS_LABELS,
  SCORE_LABELS,
  periodLabel,
  shiftPeriod,
  type AccountRating,
  type ReviewStatus,
} from '@/lib/review-rules';
import type { VersionRow } from '@/lib/reviews';
import { cn, formatDate } from '@/lib/utils';

/* Shared pieces of the M67 screens: review status, account rating, scores and the month switcher. */

const STATUS_TONE: Record<ReviewStatus, Tone> = { draft: 'amber', submitted: 'blue', approved: 'green' };

/** A review's status; "Not started" when there is no review yet. */
export function ReviewStatusBadge({ value }: { value: ReviewStatus | null }) {
  if (value === null) return <Badge>Not started</Badge>;
  return <Badge tone={STATUS_TONE[value]}>{REVIEW_STATUS_LABELS[value]}</Badge>;
}

const RATING_TONE: Record<AccountRating, Tone> = { green: 'green', amber: 'amber', red: 'rose' };

export function RatingBadge({ value, short }: { value: AccountRating | null; short?: boolean }) {
  if (value === null) return <span className="text-ink3">—</span>;
  const label = ACCOUNT_RATING_LABELS[value];
  return <Badge tone={RATING_TONE[value]}>{short ? label.split(' —')[0] : label}</Badge>;
}

/** An average score out of 5, or an em dash when nothing is scored (never 0). */
export function ScoreValue({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink3">—</span>;
  const tone = value >= 4 ? 'text-emerald-600 dark:text-emerald-400' : value < 3 ? 'text-rose-600 dark:text-rose-400' : 'text-ink';
  return (
    <span className={cn('tnum font-medium', tone)}>
      {value.toFixed(1)}
      <span className="text-xs font-normal text-ink3">/{MAX_SCORE}</span>
    </span>
  );
}

/** Five buttons, 1 to 5. Clicking the chosen one again clears it. */
export function ScorePicker({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  label: string;
}) {
  const scores = Array.from({ length: MAX_SCORE - MIN_SCORE + 1 }, (_, i) => MIN_SCORE + i);
  return (
    <div className="flex gap-1" role="radiogroup" aria-label={label}>
      {scores.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          title={SCORE_LABELS[n]}
          disabled={disabled}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            'tnum h-8 w-8 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed',
            value === n
              ? 'border-brand bg-brand text-white'
              : 'border-line bg-surface text-ink2 hover:bg-surface2 disabled:hover:bg-surface',
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/** Previous / next month, as links so the page reloads its data on the server. */
export function PeriodSwitcher({ period, basePath }: { period: string; basePath: string }) {
  return (
    <div className="flex items-center gap-1">
      <Link
        href={`${basePath}?period=${shiftPeriod(period, -1)}`}
        className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-[9rem] text-center text-sm font-medium text-ink">{periodLabel(period)}</span>
      <Link
        href={`${basePath}?period=${shiftPeriod(period, 1)}`}
        className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/** "Returned by Admin: …" — shown on a draft that came back. */
export function ReturnedNote({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <span className="font-medium">Sent back by Admin:</span> {reason}
    </div>
  );
}

/** "Locked" note on a submitted or approved review: nobody edits it in place. */
export function LockedNote() {
  return (
    <p className="rounded-md bg-surface2 px-3 py-2 text-xs text-ink2">
      Locked. Only Admin can reopen it; it then goes back to a draft, and submitting it again records a new version with a note of what changed.
    </p>
  );
}

/**
 * Every time the review was locked, newest first, with the note saying what
 * changed and the differences from the version before it. Shown to the back
 * office only; Sales never receives it.
 */
export function VersionHistory({ versions }: { versions: VersionRow[] }) {
  if (versions.length === 0) return null;
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">Version history</h2>
        <span className="text-xs text-ink3">
          {versions.length} {versions.length === 1 ? 'version' : 'versions'}
        </span>
      </div>
      <ol className="space-y-4">
        {versions.map((v, i) => (
          <li key={v.version} className="border-l-2 border-line pl-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-ink">Version {v.version}</span>
              {i === 0 && <Badge tone="blue">Latest locked</Badge>}
              <span className="text-xs text-ink3">
                {formatDate(v.lockedAt)}
                {v.lockedByName ? ` · ${v.lockedByName}` : ''}
              </span>
            </div>
            {v.changeNote && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink2">
                <span className="font-medium text-ink">What changed:</span> {v.changeNote}
              </p>
            )}
            {v.version === 1 ? (
              <p className="mt-1 text-xs text-ink3">First locked version.</p>
            ) : v.changes.length === 0 ? (
              <p className="mt-1 text-xs text-ink3">Nothing differs from version {v.version - 1}.</p>
            ) : (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs font-medium text-brand">
                  {v.changes.length} {v.changes.length === 1 ? 'change' : 'changes'} from version {v.version - 1}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {v.changes.map((c) => (
                    <li key={c.field} className="text-xs text-ink2">
                      <span className="font-medium text-ink">{c.field}</span>
                      <div className="mt-0.5 flex flex-wrap items-start gap-x-2 gap-y-0.5">
                        <span className="whitespace-pre-wrap break-words text-rose-700 line-through dark:text-rose-300">{c.from ?? '—'}</span>
                        <span aria-hidden>→</span>
                        <span className="whitespace-pre-wrap break-words text-emerald-700 dark:text-emerald-300">{c.to ?? '—'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The required note when a reopened review is submitted again. */
export function ChangeNoteField({
  value,
  onChange,
  error,
  nextVersion,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  nextVersion: number;
}) {
  return (
    <section className="card space-y-2 p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">What changed?</h2>
        <p className="text-xs text-ink3">
          This will be saved as version {nextVersion}. Admin sees your note and the differences from the version before.
        </p>
      </div>
      <textarea
        className={cn('input min-h-[72px]', error && 'border-rose-400')}
        placeholder="For example: raised Communication to 5 after the client's feedback; added a note on timesheets."
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </section>
  );
}
