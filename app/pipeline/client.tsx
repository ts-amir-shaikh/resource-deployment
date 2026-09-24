'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Search,
  Target,
  LayoutGrid,
  List,
  MapPin,
  Users,
  CalendarClock,
  X,
  Globe,
  ArrowDownWideNarrow,
} from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import {
  daysInStage,
  daysInStageLabel,
  STALL_DAYS,
  formatDate,
  formatExperience,
  formatBudget,
  STAGE_LABELS,
  ACTIVE_STAGES,
  WORK_MODE_LABELS,
  ENGAGEMENT_LABELS,
  LIST_PAGE_SIZE,
  opportunityValue,
  valueSummary,
  coverageNote,
  formatMoneyMulti,
  formatMoneyCompact,
} from '@/lib/utils';
import type { Role } from '@/lib/auth';
import OpportunityFormFields, {
  BLANK_OPPORTUNITY,
  toPayload,
  type ClientOption,
  type ProspectOption,
  nextInBatch,
  type OpportunityFormValues,
} from '@/components/opportunity-form';
import {
  PageHeader,
  Modal,
  Field,
  EmptyState,
  TableShell,
  Badge,
  Pagination,
  KpiCard,
  type Tone,
} from '@/components/ui';
import { Combobox, type ComboOption } from '@/components/combobox';

type Row = {
  id: number;
  clientId: number | null;
  companyName: string;
  title: string;
  experienceMin: number | null;
  experienceMax: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  workMode: string | null;
  location: string | null;
  timezone: string | null;
  engagementType: string | null;
  requiredCount: number;
  currency: string;
  dealValue: number | null;
  budgetMin: number | null;
  budgetMax: number | null;
  hiringBudgetMin: number | null;
  hiringBudgetMax: number | null;
  isListed: boolean;
  stage: string;
  priority: string | null;
  leadOwnerUserId: number | null;
  salesOwnerUserId: number | null;
  nextStep: string | null;
  nextStepDate: string | null;
  closedReason: string | null;
  convertedProjectId: number | null;
  clientName: string | null;
  isProspect: boolean;
  mappedCount: number;
  filledCount: number;
  stageSince: string;
  followUpDue: boolean;
};

const PRIORITY_TONE: Record<string, Tone> = {
  high: 'rose',
  medium: 'amber',
  low: 'neutral',
};

const STAGE_TONE: Record<string, Tone> = {
  requirement: 'neutral',
  qualification: 'blue',
  budgeting: 'violet',
  candidate_mapping: 'amber',
  interview: 'rose',
  agreement: 'blue',
  won: 'green',
  lost: 'neutral',
  hold: 'amber',
};


/** "9 positions" / "1 position" / "no positions" — the line under a funnel count. */
function positionNote(n: number): string {
  if (n === 0) return 'no positions';
  return `${n} position${n === 1 ? '' : 's'}`;
}

export default function PipelineClient({
  initial,
  clients,
  prospects,
  role,
}: {
  initial: Row[];
  clients: ClientOption[];
  prospects: ProspectOption[];
  role: Role;
}) {
  const router = useRouter();
  // TA fulfils requirements but does not raise them, and Management is
  // view-only — both match the policy middleware enforces, so the button is
  // absent rather than present-and-rejected.
  // Admin raises requirements; so does leadgen (they own what they raise)
  // and sales. TA fulfils and Management watches.
  const canCreate = role === 'admin' || role === 'leadgen' || role === 'sales';
  // TA sees what we can offer a candidate; everyone else sees what the client
  // pays. The other figure is not in the payload at all for that role.
  const showHiringBudget = role === 'ta';
  // Pipeline value is client-facing money — withheld from TA for the same
  // reason the client budget is. Their deal values arrive already nulled, so
  // this only decides whether to render the tiles at all.
  const showValue = role !== 'ta';
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  // The board already groups by stage via its columns, so this filter only
  // applies to the list view, where there is no equivalent structure.
  const [stageFilter, setStageFilter] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('');
  // Off by default: the board's own order is by recency, which is what people
  // expect when they arrive. Sorting is something you ask for.
  const [sortOldest, setSortOldest] = useState(false);
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OpportunityFormValues>(BLANK_OPPORTUNITY);
  const [addedInBatch, setAddedInBatch] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((o) => {
      if (!showClosed && ['won', 'lost'].includes(o.stage)) return false;
      if (companyFilter && o.companyName !== companyFilter) return false;
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) ||
        o.companyName.toLowerCase().includes(q) ||
        (o.primarySkill ?? '').toLowerCase().includes(q) ||
        (o.location ?? '').toLowerCase().includes(q)
      );
    });
  }, [initial, search, showClosed, companyFilter]);

  // Only companies that actually appear on the board this viewer can see: a
  // list of mostly dead ends is worse than no list. Grouped the way the
  // requirement form groups them, and counted so the shape reads before you pick.
  const companyOptions: ComboOption[] = useMemo(() => {
    const seen = new Map<string, { n: number; prospect: boolean }>();
    for (const o of initial) {
      if (!showClosed && ['won', 'lost'].includes(o.stage)) continue;
      const cur = seen.get(o.companyName);
      if (cur) cur.n += 1;
      else seen.set(o.companyName, { n: 1, prospect: o.isProspect });
    }
    return [...seen.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, meta]) => ({
        value: name,
        label: name,
        detail: `${meta.n} requirement${meta.n === 1 ? '' : 's'}`,
        group: meta.prospect ? 'Prospects' : 'Clients',
      }))
      .sort((a, b) => (a.group === b.group ? 0 : a.group === 'Clients' ? -1 : 1));
  }, [initial, showClosed]);

  const listFiltered = useMemo(
    () => (stageFilter === 'all' ? filtered : filtered.filter((o) => o.stage === stageFilter)),
    [filtered, stageFilter],
  );

  useEffect(() => setPage(1), [search, showClosed, stageFilter, companyFilter]);

  const listSorted = useMemo(
    () =>
      sortOldest
        ? [...listFiltered].sort((a, b) => a.stageSince.localeCompare(b.stageSince))
        : listFiltered,
    [listFiltered, sortOldest],
  );

  const pageItems = useMemo(
    () => listSorted.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [listSorted, page],
  );

  const stats = useMemo(() => {
    const open = initial.filter((o) => (ACTIVE_STAGES as readonly string[]).includes(o.stage));
    const won = initial.filter((o) => o.stage === 'won');
    const hold = initial.filter((o) => o.stage === 'hold');
    const lost = initial.filter((o) => o.stage === 'lost');
    const positions = (rows: typeof initial) => rows.reduce((s, o) => s + o.requiredCount, 0);
    // Positions actually taken, derived the way you read it: headcount asked
    // for, less the seats still pending. Pending is floored at zero so that
    // over-mapping — three offers against two seats — cannot report more seats
    // filled than the requirement has.
    const filledPositions = (rows: typeof initial) =>
      rows.reduce((total, o) => {
        const pending = Math.max(0, o.requiredCount - o.filledCount);
        return total + (o.requiredCount - pending);
      }, 0);
    return {
      open: { count: open.length, positions: positions(open) },
      // Filled is the won stage only — a requirement is filled when the deal
      // is closed, not when a candidate happens to be sitting at offered.
      filled: { count: won.length, positions: filledPositions(won) },
      hold: { count: hold.length, positions: positions(hold) },
      lost: { count: lost.length, positions: positions(lost) },
      due: initial.filter((o) => o.followUpDue).length,
    };
  }, [initial]);

  const value = useMemo(() => {
    const open = initial.filter((o) => (ACTIVE_STAGES as readonly string[]).includes(o.stage));
    const won = initial.filter((o) => o.stage === 'won');
    const summary = valueSummary(open);
    const priced = open.map(opportunityValue).filter((v): v is number => v !== null);
    return {
      open: summary,
      weighted: valueSummary(open, { weighted: true }),
      won: valueSummary(won),
      lost: valueSummary(initial.filter((o) => o.stage === 'lost')),
      // Averaged over the priced deals only — dividing by the full count would
      // report an average dragged toward zero by requirements nobody costed.
      average: priced.length
        ? priced.reduce((a, b) => a + b, 0) / priced.length
        : null,
    };
  }, [initial]);

  function openCreate() {
    setForm(BLANK_OPPORTUNITY);
    setErrors({});
    setBanner(null);
    setAddedInBatch(0);
    setOpen(true);
  }

  /**
   * `andAnother` keeps the modal open and resets only the role-level fields,
   * so a lead carrying several roles is entered in one sitting (M48). The
   * request itself is identical either way.
   */
  async function save(andAnother = false) {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      await api('/api/opportunities', {
        method: 'POST',
        json: toPayload(form, clients, prospects),
      });
      if (andAnother) {
        setForm(nextInBatch(form));
        setAddedInBatch((n) => n + 1);
        // The list behind updates as each one lands rather than all at the end.
        router.refresh();
        // Back to the first field that actually changes between roles. A
        // timeout rather than requestAnimationFrame: rAF does not fire in a
        // hidden tab, so a batch continued after switching away would land the
        // cursor nowhere.
        setTimeout(() => titleRef.current?.focus(), 0);
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Staffing Pipeline"
        subtitle="Open requirements from first brief through to won"
        action={
          canCreate ? (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Opportunity
            </button>
          ) : null
        }
      />

      {/* Value KPIs — hidden from TA, who see the counts below only */}
      {showValue && (
        <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-5">
          <KpiCard
            label="Open Pipeline"
            info="Monthly value of requirements in an active stage — deal value where set, otherwise the top of the client budget range times the headcount required. Requirements with neither are counted but contribute nothing; the note beneath says how many carry a figure."
            value={formatMoneyMulti(value.open.total)}
            note={coverageNote(value.open.valued, value.open.count) ?? 'per month'}
          />
          <KpiCard
            label="Weighted"
            info="The same open value with each requirement multiplied by its stage\u2019s win probability: requirement 10%, qualification 25%, budgeting 40%, candidate mapping 60%, interview 75%, agreement 90%."
            value={formatMoneyMulti(value.weighted.total)}
            note="by stage win probability"
          />
          <KpiCard
            label="Won"
            info="Value of every requirement in the won stage, over all time rather than a rolling window."
            value={formatMoneyMulti(value.won.total)}
            note={coverageNote(value.won.valued, value.won.count) ?? 'closed deals'}
            tone="good"
          />
          <KpiCard
            label="Lost"
            info="Value of every requirement in the lost stage, over all time. Worth reading beside Won rather than alone."
            value={formatMoneyMulti(value.lost.total)}
            note={coverageNote(value.lost.valued, value.lost.count) ?? 'closed out'}
            tone={value.lost.valued > 0 ? 'bad' : 'default'}
          />
          <KpiCard
            label="Average Deal"
            info="Mean monthly value across open requirements that carry a figure. Requirements nobody has costed are left out rather than counted as zero, which would drag the average toward nothing."
            value={
              value.average === null ? '—' : `${formatMoneyCompact(value.average, 'INR')}/mo`
            }
            note={
              value.open.valued === 0
                ? 'nothing valued yet'
                : `across ${value.open.valued} valued`
            }
          />
        </div>
      )}

      {/* Funnel summary — four states, each as requirements and the positions
          inside them, plus the one card that is a thing to do. */}
      <div className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-5">
        <KpiCard
          label="Open"
          value={String(stats.open.count)}
          note={positionNote(stats.open.positions)}
          info="Requirements in one of the six active stages — requirement, qualification, budgeting, candidate mapping, interview or agreement. Won, lost and on-hold are excluded. Positions is the total headcount those requirements ask for."
        />
        <KpiCard
          label="Filled"
          value={String(stats.filled.count)}
          tone="good"
          note={positionNote(stats.filled.positions)}
          info="Requirements in the won stage. Positions counts the seats actually taken — the headcount required less those still pending — so a won requirement with one seat yet to start counts the seats filled, not the seats asked for."
        />
        <KpiCard
          label="On Hold"
          value={String(stats.hold.count)}
          note={positionNote(stats.hold.positions)}
          info="Requirements paused at the client's or our own request. Resuming returns them to the stage they were on before the hold. Positions is the headcount sitting behind that pause."
        />
        <KpiCard
          label="Lost"
          value={String(stats.lost.count)}
          tone={stats.lost.count > 0 ? 'bad' : 'default'}
          note={positionNote(stats.lost.positions)}
          info="Requirements closed without a placement, over all time rather than a rolling window. Positions is the headcount that went with them."
        />
        <KpiCard
          label="Follow-ups Due"
          value={String(stats.due)}
          tone={stats.due > 0 ? 'bad' : 'default'}
          note="next step today or overdue"
          info="Requirements whose next-step date is today or has passed, in any stage. The only figure here that is a thing to do rather than a thing to know."
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search title, company, skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink2">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-[rgb(var(--accent))]"
          />
          Show won / lost
        </label>

        {/* Company narrows both views — unlike the stage filter, which the
            board already expresses through its columns. */}
        <div className="w-56">
          <Combobox
            value={companyFilter}
            onChange={setCompanyFilter}
            options={companyOptions}
            placeholder="All companies"
            emptyLabel="No company matches"
          />
        </div>

        {view === 'list' && (
          <>
            <select
              className="input max-w-48"
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              aria-label="Filter by stage"
            >
              <option value="all">All stages</option>
              {[...ACTIVE_STAGES, 'won', 'lost', 'hold'].map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortOldest((v) => !v)}
              aria-pressed={sortOldest}
              className={`btn-ghost ${sortOldest ? 'border-brand text-ink' : ''}`}
            >
              <ArrowDownWideNarrow className="h-4 w-4" />
              Longest in stage
            </button>
          </>
        )}

        <div className="ml-auto flex rounded-md border border-line bg-surface p-0.5">
          <button
            onClick={() => setView('board')}
            className={`rounded px-2.5 py-1.5 ${view === 'board' ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'}`}
            aria-label="Board view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`rounded px-2.5 py-1.5 ${view === 'list' ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'}`}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="px-6">
        {(view === 'list' ? listFiltered.length === 0 : filtered.length === 0) ? (
          <div className="card">
            <EmptyState
              icon={Target}
              title={initial.length ? 'No matching opportunities' : 'No opportunities yet'}
              description={
                initial.length
                  ? 'Try a different search term or stage filter, or show won and lost deals.'
                  : 'Add your first requirement to start tracking it through the pipeline.'
              }
              action={
                !initial.length &&
                canCreate && (
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add Opportunity
                  </button>
                )
              }
            />
          </div>
        ) : view === 'board' ? (
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {[
                ...ACTIVE_STAGES,
                ...(showClosed ? (['won', 'lost'] as const) : []),
                'hold' as const,
              ].map((stage) => {
                const items = filtered.filter((o) => o.stage === stage);
                const positions = items.reduce((s, o) => s + o.requiredCount, 0);
                const colValue = valueSummary(items);
                return (
                  <section key={stage} className="card flex w-64 shrink-0 flex-col">
                    <header className="border-b border-line px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <Badge tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</Badge>
                        <span className="tnum text-xs text-ink3">{items.length}</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-2">
                        {positions > 0 ? (
                          <span className="tnum text-2xs text-ink3">
                            {positions} position{positions === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span />
                        )}
                        {showValue && colValue.valued > 0 && (
                          <span
                            className="tnum text-2xs font-medium text-ink2"
                            title={
                              coverageNote(colValue.valued, colValue.count) ??
                              'every deal valued'
                            }
                          >
                            {formatMoneyMulti(colValue.total)}
                            {colValue.valued < colValue.count && (
                              <span className="ml-0.5 text-ink3">*</span>
                            )}
                          </span>
                        )}
                      </div>
                    </header>
                    <ul className="flex-1 space-y-2 p-2">
                      {items.map((o) => (
                        <li key={o.id}>
                          <Link
                            href={`/pipeline/${o.id}`}
                            className={`block rounded-md border p-2.5 transition-colors hover:border-brand ${
                              o.followUpDue
                                ? 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40'
                                : 'border-line bg-surface2/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-medium leading-snug text-ink">
                                {o.title}
                              </span>
                              {o.priority && o.priority !== 'medium' && (
                                <Badge tone={PRIORITY_TONE[o.priority]}>
                                  {o.priority}
                                </Badge>
                              )}
                            </div>

                            <div className="mt-1 flex items-center gap-1 text-2xs text-ink2">
                              <span className="truncate">{o.companyName}</span>
                              {o.isProspect && (
                                <span className="shrink-0 rounded bg-surface px-1 text-2xs text-ink3 ring-1 ring-line">
                                  prospect
                                </span>
                              )}
                              <span
                                className={`tnum ml-auto shrink-0 ${
                                  daysInStage(o.stageSince) >= STALL_DAYS
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-ink3'
                                }`}
                                title={`In this stage since ${formatDate(o.stageSince)}`}
                              >
                                {daysInStageLabel(o.stageSince)}
                              </span>
                            </div>

                            {showValue && (
                              <div className="tnum mt-1.5 text-xs font-semibold text-ink">
                                {/* "—" not "₹0": an unpriced requirement is not a
                                    worthless one, and 0 would read as a dead deal. */}
                                {opportunityValue(o) === null
                                  ? <span className="font-normal text-ink3">Not valued</span>
                                  : `${formatMoneyCompact(opportunityValue(o), o.currency)}/mo`}
                              </div>
                            )}

                            <div className="mt-2 flex flex-wrap gap-1">
                              {o.primarySkill && (
                                <Badge tone="blue">{o.primarySkill}</Badge>
                              )}
                              {o.engagementType && (
                                <Badge tone="neutral">
                                  {ENGAGEMENT_LABELS[o.engagementType]}
                                </Badge>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink3">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {o.filledCount}/{o.requiredCount}
                              </span>
                              <span>
                                {formatExperience(o.experienceMin, o.experienceMax)}
                              </span>
                              {o.workMode && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {WORK_MODE_LABELS[o.workMode]}
                                </span>
                              )}
                            </div>

                            {o.nextStepDate && (
                              <div
                                className={`mt-2 flex items-start gap-1 border-t border-line pt-2 text-2xs ${
                                  o.followUpDue
                                    ? 'font-medium text-rose-700 dark:text-rose-400'
                                    : 'text-ink3'
                                }`}
                              >
                                <CalendarClock className="mt-px h-3 w-3 shrink-0" />
                                <span className="line-clamp-2">
                                  {formatDate(o.nextStepDate)} · {o.nextStep}
                                </span>
                              </div>
                            )}
                          </Link>
                        </li>
                      ))}
                      {items.length === 0 && (
                        <li className="py-6 text-center text-2xs text-ink3">Empty</li>
                      )}
                    </ul>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Requirement</th>
                  <th className="th">Company</th>
                  <th className="th">Stage</th>
                  <th className="th">Engagement</th>
                  <th className="th text-right">Filled</th>
                  <th className="th text-right">
                    {showHiringBudget ? 'Hiring Budget' : 'Budget'}
                  </th>
                  <th className="th">Next Step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((o) => (
                  <tr
                    key={o.id}
                    className={
                      o.followUpDue
                        ? 'bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-950/20'
                        : 'hover:bg-surface2/50'
                    }
                  >
                    <td className="td">
                      <span className="inline-flex items-center gap-1.5">
                        <Link
                          href={`/pipeline/${o.id}`}
                          className="font-medium text-ink hover:text-brand hover:underline"
                        >
                          {o.title}
                        </Link>
                        {o.isListed && (
                          <Globe
                            className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-400"
                            aria-label="Listed on the public job board"
                          />
                        )}
                      </span>
                      <div className="text-2xs text-ink3">
                        {formatExperience(o.experienceMin, o.experienceMax)}
                        {o.primarySkill && ` · ${o.primarySkill}`}
                        {o.location && ` · ${o.location}`}
                      </div>
                    </td>
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <span className="text-ink">{o.companyName}</span>
                        {o.isProspect && <Badge tone="neutral">Prospect</Badge>}
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={STAGE_TONE[o.stage]}>{STAGE_LABELS[o.stage]}</Badge>
                      <div
                        className={`tnum mt-0.5 text-2xs ${
                          daysInStage(o.stageSince) >= STALL_DAYS
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-ink3'
                        }`}
                        title={`In this stage since ${formatDate(o.stageSince)}`}
                      >
                        {daysInStageLabel(o.stageSince)} in stage
                      </div>
                      {o.closedReason && (
                        <div className="mt-0.5 max-w-40 truncate text-2xs text-ink3">
                          {o.closedReason}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      {o.engagementType ? ENGAGEMENT_LABELS[o.engagementType] : '—'}
                      <div className="text-2xs text-ink3">
                        {o.workMode ? WORK_MODE_LABELS[o.workMode] : ''}
                        {o.timezone ? ` · ${o.timezone}` : ''}
                      </div>
                    </td>
                    <td className="td text-right">
                      <span className="tnum text-ink">
                        {o.filledCount}/{o.requiredCount}
                      </span>
                      <div className="text-2xs text-ink3">{o.mappedCount} mapped</div>
                    </td>
                    <td className="td text-right">
                      <span className="tnum text-ink2">
                        {showHiringBudget
                          ? formatBudget(o.hiringBudgetMin, o.hiringBudgetMax)
                          : formatBudget(o.budgetMin, o.budgetMax)}
                      </span>
                    </td>
                    <td className="td">
                      {o.nextStep ? (
                        <>
                          <div
                            className={`max-w-56 truncate text-xs ${o.followUpDue ? 'font-medium text-rose-700 dark:text-rose-400' : 'text-ink2'}`}
                          >
                            {o.nextStep}
                          </div>
                          <div className="tnum text-2xs text-ink3">
                            {formatDate(o.nextStepDate)}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            {listFiltered.length > 0 && (
              <Pagination
                page={page}
                pageSize={LIST_PAGE_SIZE}
                total={listFiltered.length}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Opportunity"
        description="New requirements enter the pipeline at the Requirement stage"
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <OpportunityFormFields
          form={form}
          setForm={setForm}
          errors={errors}
          clients={clients}
          prospects={prospects}
          titleRef={titleRef}
        />

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {addedInBatch > 0 && (
            <span className="mr-auto text-xs text-ink2" role="status">
              {addedInBatch} added · company and terms carried over
            </span>
          )}
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            {addedInBatch > 0 ? 'Done' : 'Cancel'}
          </button>
          <button className="btn-ghost" onClick={() => save(true)} disabled={saving}>
            Save and add another
          </button>
          <button className="btn-primary" onClick={() => save()} disabled={saving}>
            {saving ? 'Saving…' : 'Add Opportunity'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
