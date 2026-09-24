import Link from 'next/link';
import { CalendarClock, HelpCircle, Hourglass, Rocket } from 'lucide-react';
import { formatDate, formatMoneyMulti, STAGE_LABELS, type valueSummary } from '@/lib/utils';
import type { getOwnerBoard, getOwnerTeamBoard, OwnerKind } from '@/lib/queries';
import { KpiCard, Badge, PageHeader } from '@/components/ui';
import { DetailSection, DetailEmpty } from '@/components/detail';
import MemberSelect from '@/app/my/member-select';

type Board = Awaited<ReturnType<typeof getOwnerBoard>>;
type TeamBoard = Awaited<ReturnType<typeof getOwnerTeamBoard>>;

/**
 * The board a leadgen or sales person works from. One component, two kinds:
 * the KPIs differ, the shape does not — pending actions first, then what they
 * own. Mirrors /my so somebody who moves between teams is never lost.
 */
export default function OwnerBoard({
  kind,
  board,
  team,
  viewing,
  viewerName,
  members,
  isHead,
}: {
  kind: OwnerKind;
  board: Board;
  team: TeamBoard | null;
  viewing: { id: number; name: string } | null;
  viewerName: string;
  members: { id: number; name: string; isTeamLead: boolean }[];
  isHead: boolean;
}) {
  // The two kinds carry different KPI sets; read through an index so one
  // component renders both without a discriminated dance.
  const c = board.counts as unknown as Record<string, number> & { inFlight?: ReturnType<typeof valueSummary> };
  const isLead = kind === 'lead';
  const base = isLead ? '/leads' : '/sales';

  const actions = [
    {
      key: 'follow',
      icon: CalendarClock,
      label: 'Follow-ups due',
      items: board.followUpsDue.map((o) => ({
        id: o.id,
        primary: o.title,
        secondary: `${o.nextStep ?? 'Next step'} · due ${formatDate(o.nextStepDate)}`,
      })),
    },
    {
      key: 'next',
      icon: HelpCircle,
      label: 'No next step recorded',
      items: board.noNextStep.map((o) => ({
        id: o.id,
        primary: o.title,
        secondary: `${o.companyName} · ${STAGE_LABELS[o.stage] ?? o.stage}`,
      })),
    },
    {
      key: 'stalled',
      icon: Hourglass,
      label: 'Stalled',
      items: board.stalled.map((o) => ({
        id: o.id,
        primary: o.title,
        secondary: `${STAGE_LABELS[o.stage] ?? o.stage} since ${formatDate((o.lastMovedAt ?? o.createdAt).slice(0, 10))}`,
      })),
    },
    ...(isLead
      ? []
      : [
          {
            key: 'won',
            icon: Rocket,
            label: 'Won, awaiting project conversion',
            items: board.wonNotConverted.map((o) => ({
              id: o.id,
              primary: o.title,
              secondary: `${o.companyName} · Admin converts this into a project`,
            })),
          },
        ]),
  ];
  const pendingTotal = actions.reduce((n, a) => n + a.items.length, 0);

  return (
    <div className="pb-12">
      <PageHeader
        title={viewing ? `${viewing.name}'s ${isLead ? 'leads' : 'deals'}` : `Hello, ${viewerName.split(' ')[0]}`}
        subtitle={
          pendingTotal === 0
            ? 'Nothing waiting right now.'
            : `${pendingTotal} thing${pendingTotal === 1 ? '' : 's'} waiting.`
        }
        action={isHead ? <MemberSelect members={members} selected={viewing?.id ?? null} base={base} /> : undefined}
      />

      <div className={`grid grid-cols-2 gap-3 px-6 pt-4 ${isLead ? 'lg:grid-cols-6' : 'lg:grid-cols-6'}`}>
        {isLead ? (
          <>
            <KpiCard
              label="Added this month"
              value={String(c.addedThisMonth)}
              info="Requirements you are the lead owner of that were created since the first of this calendar month. Counts when it was logged, not when it moved."
            />
            <KpiCard
              label="Requirement"
              value={String(c.inRequirement)}
              info="Your leads sitting at the first stage — logged, not yet qualified. The ones with no next step are listed as a pending action below."
            />
            <KpiCard
              label="Qualification"
              value={String(c.inQualification)}
              info="Your leads being qualified: the brief is being pinned down before anyone talks money."
            />
            <KpiCard
              label="Budgeting"
              value={String(c.inBudgeting)}
              info="Your leads at the budgeting stage — the last one you can move. Going further is a handover, made by setting a sales owner."
            />
            <KpiCard
              label="Handed on"
              value={String(c.handedOn)}
              tone="good"
              info="Your leads that have moved past budgeting — candidate mapping, interview, agreement or won. Read-only to you from here, and kept visible so you can see what became of them."
            />
            <KpiCard
              label="Lost"
              value={String(c.lost)}
              info="Your leads closed without a placement, over all time. Includes those lost after handover."
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Mapping"
              value={String(c.inMapping)}
              info="Deals you own at candidate mapping — the client has a brief and TA is putting profiles against it."
            />
            <KpiCard
              label="Interview"
              value={String(c.inInterview)}
              info="Deals you own where candidates are in front of the client."
            />
            <KpiCard
              label="Agreement"
              value={String(c.inAgreement)}
              info="Deals you own at the paperwork stage — agreed in principle, not yet closed."
            />
            <KpiCard
              label="Won · 90d"
              value={String(c.won90)}
              tone="good"
              info="Deals you own that moved to won in the last 90 days, read from the stage history. A rolling window, not this calendar month."
            />
            <KpiCard
              label="Lost · 90d"
              value={String(c.lost90)}
              info="Deals you own that moved to lost in the last 90 days. Same window as Won, so the two read against each other."
            />
            <KpiCard
              label="In flight"
              value={c.inFlight ? formatMoneyMulti(c.inFlight.total) : '—'}
              note="stage-weighted"
              info="Monthly value of your open deals past qualification, each multiplied by its stage&rsquo;s win probability — candidate mapping 60%, interview 75%, agreement 90%. Requirements still at requirement or qualification are left out as too early to count."
            />
          </>
        )}
      </div>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
        {actions.map((a) => (
          <DetailSection key={a.key} title={a.label} count={a.items.length}>
            {a.items.length === 0 ? (
              <DetailEmpty>Nothing here — good.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {a.items.slice(0, 8).map((it) => (
                  <li key={`${a.key}-${it.id}`} className="px-4 py-2.5">
                    <Link href={`/pipeline/${it.id}`} className="text-sm font-medium text-ink hover:text-brand">
                      {it.primary}
                    </Link>
                    <div className="truncate text-2xs text-ink3">{it.secondary}</div>
                  </li>
                ))}
                {a.items.length > 8 && (
                  <li className="px-4 py-2 text-2xs text-ink3">+ {a.items.length - 8} more</li>
                )}
              </ul>
            )}
          </DetailSection>
        ))}
      </div>

      <div className="px-6">
        <DetailSection
          title={isLead ? 'My leads' : 'My deals'}
          count={board.requirements.length}
          hint={isLead ? 'Including what has been handed on — read-only once past budgeting' : undefined}
        >
          {board.requirements.length === 0 ? (
            <DetailEmpty>
              {isLead
                ? 'Nothing yet. Add a requirement from the pipeline and it lands here as yours.'
                : 'Nothing assigned to you yet. A sales owner is set on the requirement page.'}
            </DetailEmpty>
          ) : (
            <ul className="divide-y divide-line">
              {board.requirements.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/pipeline/${o.id}`} className="truncate text-sm font-medium text-ink hover:text-brand">
                      {o.title}
                    </Link>
                    <div className="truncate text-2xs text-ink3">{o.companyName}</div>
                  </div>
                  <Badge tone={['won'].includes(o.stage) ? 'green' : o.stage === 'lost' ? 'neutral' : 'blue'}>
                    {STAGE_LABELS[o.stage] ?? o.stage}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      </div>

      {team && (
        <div className="px-6 pt-6">
          <DetailSection title="Team" hint="Every member's load — you see this because you head the team">
            <ul className="divide-y divide-line">
              {team.perPerson.map(({ user, board: b }) => {
                const bc = b.counts as unknown as Record<string, number>;
                const pending = b.followUpsDue.length + b.noNextStep.length + b.stalled.length;
                return (
                  <li key={user.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`${base}?member=${user.id}`} className="text-sm font-medium text-ink hover:text-brand">
                        {user.name}
                        {user.isTeamLead && <span className="ml-1.5 text-2xs font-normal text-ink3">head</span>}
                      </Link>
                      <span className="tnum text-2xs text-ink3">
                        {isLead
                          ? `${b.requirements.length} leads · ${bc.handedOn} handed on · ${bc.lost} lost`
                          : `${b.open.length} open · ${bc.won90} won · ${bc.lost90} lost (90d)`}
                      </span>
                    </div>
                    <div className={`mt-0.5 text-2xs ${pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink3'}`}>
                      {pending === 0 ? 'nothing pending' : `${pending} pending action${pending === 1 ? '' : 's'}`}
                    </div>
                  </li>
                );
              })}
              {team.unowned.length > 0 && (
                <li className="px-4 py-3">
                  <div className="text-sm font-medium text-ink">
                    {isLead ? 'No lead owner' : 'No sales owner'}
                    <span className="ml-1.5 font-normal text-ink3">{team.unowned.length}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {team.unowned.slice(0, 6).map((o) => (
                      <li key={o.id} className="text-2xs text-ink3">
                        <Link href={`/pipeline/${o.id}`} className="hover:text-brand">{o.title}</Link> · {o.companyName} · {STAGE_LABELS[o.stage] ?? o.stage}
                      </li>
                    ))}
                    {team.unowned.length > 6 && <li className="text-2xs text-ink3">+ {team.unowned.length - 6} more</li>}
                  </ul>
                  <p className="mt-1 text-2xs text-ink3">Set the owner from the requirement page.</p>
                </li>
              )}
            </ul>
          </DetailSection>
        </div>
      )}
    </div>
  );
}
