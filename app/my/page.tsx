import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarClock, Inbox, Send, MessageSquareWarning } from 'lucide-react';
import { getRecruiterBoard, getTeamBoard, getApplicantAlert } from '@/lib/queries';
import { requireSession } from '@/lib/session';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { formatDate, STAGE_LABELS } from '@/lib/utils';
import { KpiCard, Badge, PageHeader } from '@/components/ui';
import { DetailSection, DetailEmpty } from '@/components/detail';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Work · Resource Deployment' };

/**
 * A recruiter's own board, and — for a team lead — the same view rolled up
 * across the team.
 *
 * No money anywhere: pipeline value and client budgets stay withheld from TA
 * exactly as they are on every other TA screen. A lead manages recruiters, not
 * margins, so the flag widens who is visible without widening what is visible.
 */
export default async function MyWorkPage() {
  const session = await requireSession();
  // Back-office roles have the main Dashboard; this page is the TA surface.
  if (session.role !== 'ta') redirect('/');

  const me = session.uid
    ? await db
        .select({ isTeamLead: users.isTeamLead, seenAt: users.applicationsSeenAt })
        .from(users)
        .where(eq(users.id, session.uid))
        .get()
    : undefined;
  const isLead = Boolean(me?.isTeamLead);

  const board = await getRecruiterBoard(session.uid || -1);
  const team = isLead ? await getTeamBoard() : null;
  // A lead's scope is the team, so they are not filtered to their own rows.
  const alert = await getApplicantAlert(
    isLead ? undefined : session.uid || -1,
    me?.seenAt ?? null,
  );

  const actions = [
    {
      key: 'follow',
      hint: undefined as string | undefined,
      icon: CalendarClock,
      label: 'Follow-ups due',
      items: board.followUpsDue.map((o) => ({
        id: o.id,
        href: `/pipeline/${o.id}`,
        primary: o.title,
        secondary: `${o.nextStep ?? 'Next step'} · due ${formatDate(o.nextStepDate)}`,
      })),
    },
    {
      key: 'submit',
      hint: undefined as string | undefined,
      icon: Send,
      label: 'Mapped, not submitted',
      items: board.notSubmitted.map((m) => ({
        id: m.id,
        href: `/pipeline/${m.opportunityId}`,
        primary: m.candidateName,
        secondary: m.title,
      })),
    },
    {
      key: 'feedback',
      hint: undefined as string | undefined,
      icon: MessageSquareWarning,
      label: 'Interviews with no feedback',
      items: board.interviewsUnlogged.map((m) => ({
        id: m.id,
        href: `/pipeline/${m.opportunityId}`,
        primary: m.candidateName,
        secondary: `${m.title} · interviewed ${formatDate(m.interviewDate)}`,
      })),
    },
    {
      key: 'inbox',
      icon: Inbox,
      label: 'Profiles waiting for review',
      hint:
        alert.fresh > 0
          ? `${alert.fresh} arrived since you last looked`
          : alert.uncalled > 0
            ? `${alert.uncalled} nobody has called yet`
            : undefined,
      items: board.inboxWaiting.map((r) => ({
        id: r.id,
        href: '/candidates?tab=applicants',
        primary: r.candidateName,
        secondary: `${r.kind === 'application' ? 'Applied' : 'Referred'} · ${r.title}`,
      })),
    },
  ];

  // Somebody applied while this recruiter was elsewhere — that goes first.
  // Otherwise the order stays as written: the morning list, then the inbox.
  if (alert.fresh > 0) {
    const i = actions.findIndex((a) => a.key === 'inbox');
    actions.unshift(...actions.splice(i, 1));
  }

  const pendingTotal = actions.reduce((n, a) => n + a.items.length, 0);

  return (
    <div className="pb-12">
      <PageHeader
        title={`Hello, ${session.name.split(' ')[0]}`}
        subtitle={
          pendingTotal === 0
            ? 'Nothing waiting on you right now.'
            : `${pendingTotal} thing${pendingTotal === 1 ? '' : 's'} waiting on you` +
              (alert.fresh > 0
                ? `, including ${alert.fresh} new applicant${alert.fresh === 1 ? '' : 's'}.`
                : '.')
        }
      />

      <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-5">
        <KpiCard label="My Requirements" value={String(board.requirements.length)} note={`${board.counts.positions} positions`} />
        <KpiCard label="Submitted" value={String(board.counts.submitted)} />
        <KpiCard label="Interviewing" value={String(board.counts.interviewing)} />
        <KpiCard label="Offered" value={String(board.counts.offered)} tone="good" />
        <KpiCard label="Joined" value={String(board.counts.joined)} tone="good" />
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
        {actions.map((a) => (
          <DetailSection key={a.key} title={a.label} count={a.items.length} hint={a.hint}>
            {a.items.length === 0 ? (
              <DetailEmpty>Nothing here — good.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {a.items.slice(0, 8).map((it) => (
                  <li key={`${a.key}-${it.id}`} className="px-4 py-2.5">
                    <Link
                      href={it.href}
                      className="text-sm font-medium text-ink hover:text-brand"
                    >
                      {it.primary}
                    </Link>
                    <div className="truncate text-2xs text-ink3">{it.secondary}</div>
                  </li>
                ))}
                {a.items.length > 8 && (
                  <li className="px-4 py-2 text-2xs text-ink3">
                    + {a.items.length - 8} more
                  </li>
                )}
              </ul>
            )}
          </DetailSection>
        ))}
      </div>

      <div className="px-6">
        <DetailSection title="My Requirements" count={board.requirements.length}>
          {board.requirements.length === 0 ? (
            <DetailEmpty>
              Nothing is assigned to you yet. Requirements show here once an
              owner is set on them.
            </DetailEmpty>
          ) : (
            <ul className="divide-y divide-line">
              {board.requirements.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <Link
                    href={`/pipeline/${o.id}`}
                    className="truncate text-sm font-medium text-ink hover:text-brand"
                  >
                    {o.title}
                  </Link>
                  <Badge tone="neutral">{STAGE_LABELS[o.stage] ?? o.stage}</Badge>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </div>

      {team && (
        <div className="px-6 pt-6">
          <DetailSection
            title="Team"
            hint="Every recruiter's load — you see this because you are a team lead"
          >
            <ul className="divide-y divide-line">
              {team.perPerson.map(({ user, board: b }) => {
                const pending =
                  b.followUpsDue.length +
                  b.notSubmitted.length +
                  b.interviewsUnlogged.length +
                  b.inboxWaiting.length;
                return (
                  <li key={user.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink">
                        {user.name}
                        {user.isTeamLead && (
                          <span className="ml-1.5 text-2xs font-normal text-ink3">lead</span>
                        )}
                      </span>
                      <span className="tnum text-2xs text-ink3">
                        {b.requirements.length} req · {b.counts.submitted} submitted ·{' '}
                        {b.counts.interviewing} interviewing · {b.counts.joined} joined
                      </span>
                    </div>
                    <div
                      className={`mt-0.5 text-2xs ${pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink3'}`}
                    >
                      {pending === 0 ? 'nothing pending' : `${pending} pending action${pending === 1 ? '' : 's'}`}
                    </div>
                  </li>
                );
              })}

              {team.unassigned.length > 0 && (
                <li className="px-4 py-3">
                  <div className="text-sm font-medium text-ink">Unassigned</div>
                  <p className="mt-0.5 text-2xs text-ink3">
                    {team.unassigned.length} open requirement
                    {team.unassigned.length === 1 ? '' : 's'} with no owner account —
                    either predating user accounts, or owned by a name with no login.
                    Admin can set an owner, or create the account and re-run the
                    attribution backfill.
                  </p>
                </li>
              )}
            </ul>
          </DetailSection>
        </div>
      )}
    </div>
  );
}
