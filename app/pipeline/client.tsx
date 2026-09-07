'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import {
  formatDate,
  formatExperience,
  formatBudget,
  STAGE_LABELS,
  ACTIVE_STAGES,
  WORK_MODE_LABELS,
  ENGAGEMENT_LABELS,
  LIST_PAGE_SIZE,
} from '@/lib/utils';
import type { Role } from '@/lib/auth';
import OpportunityFormFields, {
  BLANK_OPPORTUNITY,
  toPayload,
  type ClientOption,
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
  type Tone,
} from '@/components/ui';

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
  budgetMin: number | null;
  budgetMax: number | null;
  hiringBudgetMin: number | null;
  hiringBudgetMax: number | null;
  isListed: boolean;
  stage: string;
  priority: string | null;
  owner: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  closedReason: string | null;
  convertedProjectId: number | null;
  clientName: string | null;
  isProspect: boolean;
  mappedCount: number;
  filledCount: number;
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


export default function PipelineClient({
  initial,
  clients,
  role,
}: {
  initial: Row[];
  clients: ClientOption[];
  role: Role;
}) {
  const router = useRouter();
  // TA fulfils requirements but does not raise them, and Management is
  // view-only — both match the policy middleware enforces, so the button is
  // absent rather than present-and-rejected.
  const canCreate = role === 'admin';
  // TA sees what we can offer a candidate; everyone else sees what the client
  // pays. The other figure is not in the payload at all for that role.
  const showHiringBudget = role === 'ta';
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  // The board already groups by stage via its columns, so this filter only
  // applies to the list view, where there is no equivalent structure.
  const [stageFilter, setStageFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OpportunityFormValues>(BLANK_OPPORTUNITY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((o) => {
      if (!showClosed && ['won', 'lost'].includes(o.stage)) return false;
      if (!q) return true;
      return (
        o.title.toLowerCase().includes(q) ||
        o.companyName.toLowerCase().includes(q) ||
        (o.primarySkill ?? '').toLowerCase().includes(q) ||
        (o.location ?? '').toLowerCase().includes(q)
      );
    });
  }, [initial, search, showClosed]);

  const listFiltered = useMemo(
    () => (stageFilter === 'all' ? filtered : filtered.filter((o) => o.stage === stageFilter)),
    [filtered, stageFilter],
  );

  useEffect(() => setPage(1), [search, showClosed, stageFilter]);

  const pageItems = useMemo(
    () => listFiltered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [listFiltered, page],
  );

  const stats = useMemo(() => {
    const open = initial.filter((o) => (ACTIVE_STAGES as readonly string[]).includes(o.stage));
    return {
      open: open.length,
      positions: open.reduce((s, o) => s + o.requiredCount, 0),
      filled: open.reduce((s, o) => s + o.filledCount, 0),
      due: initial.filter((o) => o.followUpDue).length,
      hold: initial.filter((o) => o.stage === 'hold').length,
    };
  }, [initial]);

  function openCreate() {
    setForm(BLANK_OPPORTUNITY);
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      await api('/api/opportunities', {
        method: 'POST',
        json: toPayload(form, clients),
      });
      setOpen(false);
      router.refresh();
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
        title="Pipeline"
        subtitle="Open requirements from first brief through to won"
        action={
          canCreate ? (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Opportunity
            </button>
          ) : null
        }
      />

      {/* Funnel summary */}
      <div className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-5">
        <div className="card p-3">
          <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
            Open
          </div>
          <div className="tnum mt-1 text-xl font-semibold text-ink">{stats.open}</div>
        </div>
        <div className="card p-3">
          <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
            Positions
          </div>
          <div className="tnum mt-1 text-xl font-semibold text-ink">
            {stats.positions}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
            Filled
          </div>
          <div className="tnum mt-1 text-xl font-semibold text-emerald-600 dark:text-emerald-400">
            {stats.filled}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
            Follow-ups Due
          </div>
          <div
            className={`tnum mt-1 text-xl font-semibold ${stats.due > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-ink'}`}
          >
            {stats.due}
          </div>
        </div>
        <div className="card p-3">
          <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
            On Hold
          </div>
          <div className="tnum mt-1 text-xl font-semibold text-ink">{stats.hold}</div>
        </div>
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

        {view === 'list' && (
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
                return (
                  <section key={stage} className="card flex w-64 shrink-0 flex-col">
                    <header className="border-b border-line px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <Badge tone={STAGE_TONE[stage]}>{STAGE_LABELS[stage]}</Badge>
                        <span className="tnum text-xs text-ink3">{items.length}</span>
                      </div>
                      {positions > 0 && (
                        <div className="tnum mt-1 text-2xs text-ink3">
                          {positions} position{positions === 1 ? '' : 's'}
                        </div>
                      )}
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
                            </div>

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
        />

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Add Opportunity'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
