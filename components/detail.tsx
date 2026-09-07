import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Shared furniture for the six read-only detail pages.
 *
 * These are server components with no interactivity on purpose: a detail page
 * reads, and editing stays in the modal on the list page. That keeps one
 * editing path per entity rather than two that can disagree.
 */

export function DetailHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  badges,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line px-6 py-5">
      <Link
        href={backHref}
        className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink3 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
            {badges}
          </div>
          {subtitle && <div className="mt-1 text-sm text-ink2">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function DetailSection({
  title,
  count,
  hint,
  children,
}: {
  title: string;
  count?: number;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal text-ink3">{count}</span>
          )}
        </h2>
        {hint && <p className="mt-0.5 text-2xs text-ink3">{hint}</p>}
      </header>
      {children}
    </section>
  );
}

/** Key/value grid. A null or empty value renders as an em dash, never blank. */
export function DetailFacts({
  facts,
  columns = 3,
}: {
  facts: [string, React.ReactNode][];
  columns?: 2 | 3 | 4;
}) {
  const cols =
    columns === 2 ? 'sm:grid-cols-2' : columns === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3';
  return (
    <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 p-4 ${cols}`}>
      {facts.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-2xs font-medium uppercase tracking-wider text-ink3">{k}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">
            {v === null || v === undefined || v === '' ? '—' : v}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A named contact block — used for client SPOCs and project managers. */
export function ContactCard({
  role,
  name,
  email,
  mobile,
  designation,
}: {
  role: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  designation?: string | null;
}) {
  if (!name && !email && !mobile) {
    return (
      <div className="rounded-md border border-line bg-surface2 p-3">
        <div className="text-2xs font-medium uppercase tracking-wider text-ink3">{role}</div>
        <div className="mt-1 text-sm text-ink3">Not recorded</div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-line bg-surface2 p-3">
      <div className="text-2xs font-medium uppercase tracking-wider text-ink3">{role}</div>
      <div className="mt-1 text-sm font-medium text-ink">{name ?? '—'}</div>
      {designation && <div className="text-2xs text-ink3">{designation}</div>}
      {email && (
        <a
          href={`mailto:${email}`}
          className="mt-1 block truncate text-xs text-brand hover:underline"
        >
          {email}
        </a>
      )}
      {mobile && <div className="tnum text-xs text-ink2">{mobile}</div>}
    </div>
  );
}

export function DetailEmpty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-ink3">{children}</p>;
}
