'use client';

import { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Page header ───────────────────────────────────────────── */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-6 py-5">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink2">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/* ── Badges ────────────────────────────────────────────────── */

const TONES = {
  neutral: 'bg-surface2 text-ink2 border border-line',
  blue: 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900',
  green:
    'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900',
  amber:
    'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
  rose: 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900',
  violet:
    'bg-violet-50 text-violet-700 border border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900',
} as const;

export type Tone = keyof typeof TONES;

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn('chip', TONES[tone], className)}>{children}</span>;
}

/* ── Allocation bar ────────────────────────────────────────── */

export function AllocationBar({
  billable,
  shadow,
  className,
  showLabel = true,
}: {
  billable: number;
  shadow: number;
  className?: string;
  showLabel?: boolean;
}) {
  const total = billable + shadow;
  return (
    // min-w-0 + flex-1 so the track still gets width when this sits inside a
    // flex row (dashboard list, table cells) rather than collapsing to 0.
    <div className={cn('flex min-w-0 flex-1 items-center gap-2', className)}>
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-surface2"
        role="img"
        aria-label={`${billable}% billable, ${shadow}% shadow, ${Math.max(0, 100 - total)}% available`}
      >
        <div className="flex h-full">
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${Math.min(100, billable)}%` }}
          />
          <div
            className="bg-amber-500 transition-all"
            style={{ width: `${Math.min(100 - Math.min(100, billable), shadow)}%` }}
          />
        </div>
      </div>
      {showLabel && (
        <span className="tnum w-10 shrink-0 text-right text-xs text-ink2">{total}%</span>
      )}
    </div>
  );
}

/* ── Empty state ───────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      {Icon && <Icon className="h-8 w-8 text-ink3" />}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && <p className="max-w-sm text-sm text-ink2">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/* ── Modal ─────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Callers pass `onClose={() => setOpen(false)}` inline, so its identity
  // changes on every parent re-render — including every keystroke in a form
  // field inside this modal. Reading it through a ref (rather than the
  // dependency array) means the effect below only re-runs when `open` itself
  // changes, so it no longer steals focus back to the modal on every keypress.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative z-10 w-full rounded-xl border border-line bg-surface shadow-xl outline-none',
          wide ? 'max-w-3xl' : 'max-w-xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink2">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-ink3 hover:bg-surface2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ── Form primitives ───────────────────────────────────────── */

export function Field({
  label,
  error,
  hint,
  required,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      {hint && !error && <p className="mt-1 text-xs text-ink3">{hint}</p>}
    </div>
  );
}

export function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <h3 className="mb-3 text-2xs font-semibold uppercase tracking-wider text-ink3">
        {title}
      </h3>
      {children}
    </fieldset>
  );
}

/* ── Table shell ───────────────────────────────────────────── */

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse">{children}</table>
    </div>
  );
}

/* ── Stat tile ─────────────────────────────────────────────── */

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  const valueTone =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'bad'
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-ink';

  return (
    <div className="card p-4">
      <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
        {label}
      </div>
      <div className={cn('tnum mt-1.5 text-2xl font-semibold tracking-tight', valueTone)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-ink2">{sub}</div>}
    </div>
  );
}

/* ── Pagination ────────────────────────────────────────────── */

/** first, …, current-1..current+1, …, last — collapses long runs to ellipses. */
function pageWindow(current: number, total: number): (number | '…')[] {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const out: (number | '…')[] = [1];
  if (left > 2) out.push('…');
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push('…');
  if (total > 1) out.push(total);
  return out;
}

/**
 * A table-footer pagination control. Renders the "Showing X–Y of Z" count
 * even for a single page (confirms the total at a glance); page-number
 * buttons only appear once there is more than one page.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <span className="tnum text-xs text-ink3">
        {total === 0 ? 'No results' : `Showing ${from}–${to} of ${total}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`ellipsis-${i}`} className="px-1 text-xs text-ink3">
                …
              </span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  'tnum min-w-[26px] rounded-md px-1.5 py-1 text-xs font-medium',
                  p === page
                    ? 'bg-brand text-white'
                    : 'text-ink2 hover:bg-surface2 hover:text-ink',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md p-1.5 text-ink2 hover:bg-surface2 hover:text-ink disabled:pointer-events-none disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
