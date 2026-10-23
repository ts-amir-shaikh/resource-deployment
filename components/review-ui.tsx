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
import { cn } from '@/lib/utils';

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
      <span className="font-medium">Returned for changes:</span> {reason}
    </div>
  );
}
