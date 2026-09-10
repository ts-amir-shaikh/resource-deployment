import Link from 'next/link';

/**
 * The two halves of the Candidates screen.
 *
 * Applicants are not candidates — they sit in the staging table an
 * unauthenticated form is allowed to write to, and only become candidates when
 * somebody approves them. They share a screen because that is where a
 * recruiter looks for people, not because the records are the same thing.
 *
 * Tab state lives in the URL rather than in React state so the queue is
 * linkable — the sidebar badge and the recruiter dashboard both point straight
 * at it.
 */
export default function CandidateTabs({
  active,
  waiting,
}: {
  active: 'pool' | 'applicants';
  waiting: number;
}) {
  const tabs = [
    { key: 'pool' as const, label: 'Pool', href: '/candidates' },
    {
      key: 'applicants' as const,
      label: 'Applicants',
      href: '/candidates?tab=applicants',
      count: waiting,
    },
  ];

  return (
    <div className="flex gap-1 border-b border-line px-6">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
            active === t.key
              ? 'border-brand text-ink'
              : 'border-transparent text-ink2 hover:text-ink'
          }`}
        >
          {t.label}
          {t.count ? (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {t.count}
            </span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
