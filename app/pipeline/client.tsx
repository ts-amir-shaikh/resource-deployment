'use client';

import { useMemo, useState } from 'react';
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
} from '@/lib/utils';
import {
  PageHeader,
  Modal,
  Field,
  EmptyState,
  TableShell,
  FormSection,
  Badge,
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

type ClientOption = { id: number; companyName: string };

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

const BLANK = {
  clientId: '',
  companyName: '',
  title: '',
  experienceMin: '',
  experienceMax: '',
  primarySkill: '',
  secondarySkill: '',
  otherSkills: [] as string[],
  workMode: 'onsite',
  location: '',
  timezone: '',
  engagementType: '',
  requiredCount: '1',
  budgetMin: '',
  budgetMax: '',
  jdContent: '',
  workingDays: '',
  workingHours: '',
  priority: 'medium',
  owner: '',
  nextStep: '',
  nextStepDate: '',
};

export default function PipelineClient({
  initial,
  clients,
}: {
  initial: Row[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
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
    setForm(BLANK);
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const payload = {
        ...form,
        // A picked client sets the company name; otherwise it is a prospect.
        companyName:
          form.clientId !== ''
            ? (clients.find((c) => String(c.id) === form.clientId)?.companyName ??
              form.companyName)
            : form.companyName,
        engagementType: form.engagementType === '' ? undefined : form.engagementType,
      };
      await api('/api/opportunities', { method: 'POST', json: payload });
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
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Opportunity
          </button>
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
        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Target}
              title={initial.length ? 'No matching opportunities' : 'No opportunities yet'}
              description={
                initial.length
                  ? 'Try a different search term, or show won and lost deals.'
                  : 'Add your first requirement to start tracking it through the pipeline.'
              }
              action={
                !initial.length && (
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
                  <th className="th text-right">Budget</th>
                  <th className="th">Next Step</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className={
                      o.followUpDue
                        ? 'bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-950/20'
                        : 'hover:bg-surface2/50'
                    }
                  >
                    <td className="td">
                      <Link
                        href={`/pipeline/${o.id}`}
                        className="font-medium text-ink hover:text-brand hover:underline"
                      >
                        {o.title}
                      </Link>
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
                        {formatBudget(o.budgetMin, o.budgetMax)}
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

        <div className="space-y-5">
          <FormSection title="Company">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Existing Client"
                error={errors.clientId}
                hint="Leave unset if this is a new prospect"
              >
                <select
                  className="input"
                  value={form.clientId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      clientId: e.target.value,
                      companyName:
                        clients.find((c) => String(c.id) === e.target.value)
                          ?.companyName ?? '',
                    })
                  }
                >
                  <option value="">New prospect — not a client yet</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Company Name"
                required
                error={errors.companyName}
                hint={form.clientId ? 'Taken from the selected client' : undefined}
              >
                <input
                  className="input"
                  value={form.companyName}
                  disabled={form.clientId !== ''}
                  onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Requirement">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Title" required error={errors.title} className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="e.g. FullStack Engineer (Angular + MVC + C#)"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label="Primary Skill" error={errors.primarySkill}>
                <input
                  className="input"
                  value={form.primarySkill}
                  onChange={(e) => setForm({ ...form, primarySkill: e.target.value })}
                />
              </Field>
              <Field label="Secondary Skill" error={errors.secondarySkill}>
                <input
                  className="input"
                  value={form.secondarySkill}
                  onChange={(e) => setForm({ ...form, secondarySkill: e.target.value })}
                />
              </Field>
              <Field label="Experience — Min (yrs)" error={errors.experienceMin}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.experienceMin}
                  onChange={(e) => setForm({ ...form, experienceMin: e.target.value })}
                />
              </Field>
              <Field label="Experience — Max (yrs)" error={errors.experienceMax}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.experienceMax}
                  onChange={(e) => setForm({ ...form, experienceMax: e.target.value })}
                />
              </Field>
              <Field label="Positions Required" required error={errors.requiredCount}>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.requiredCount}
                  onChange={(e) => setForm({ ...form, requiredCount: e.target.value })}
                />
              </Field>
              <Field label="Priority">
                <select
                  className="input"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Engagement">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Work Mode">
                <div className="flex rounded-md border border-line bg-surface p-0.5">
                  {(['onsite', 'hybrid', 'remote'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setForm({ ...form, workMode: m })}
                      className={`flex-1 rounded px-2 py-1.5 text-sm font-medium capitalize transition-colors ${
                        form.workMode === m
                          ? 'bg-brand text-white'
                          : 'text-ink2 hover:text-ink'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Engagement Type" error={errors.engagementType}>
                <select
                  className="input"
                  value={form.engagementType}
                  onChange={(e) => setForm({ ...form, engagementType: e.target.value })}
                >
                  <option value="">Not set</option>
                  <option value="c2h">Contract to Hire</option>
                  <option value="contract">Contract</option>
                  <option value="permanent">Permanent</option>
                  <option value="pilot">Pilot</option>
                </select>
              </Field>
              <Field label="Client Location" error={errors.location}>
                <input
                  className="input"
                  placeholder="e.g. Goregaon, Mumbai"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </Field>
              <Field label="Timezone" error={errors.timezone}>
                <input
                  className="input"
                  placeholder="e.g. USA Timezone"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
              </Field>
              <Field label="Working Days" error={errors.workingDays}>
                <input
                  className="input"
                  placeholder="e.g. Mon–Fri"
                  value={form.workingDays}
                  onChange={(e) => setForm({ ...form, workingDays: e.target.value })}
                />
              </Field>
              <Field label="Working Hours" error={errors.workingHours}>
                <input
                  className="input"
                  placeholder="e.g. 2:00 PM – 11:00 PM IST"
                  value={form.workingHours}
                  onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Budget & Ownership">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Budget Min (₹/month)"
                error={errors.budgetMin}
                hint="Optional — leave blank if not shared"
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.budgetMin}
                  onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
                />
              </Field>
              <Field label="Budget Max (₹/month)" error={errors.budgetMax}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.budgetMax}
                  onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
                />
              </Field>
              <Field label="Owner" error={errors.owner}>
                <input
                  className="input"
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                />
              </Field>
              <Field label="Next Step Date" error={errors.nextStepDate}>
                <input
                  className="input"
                  type="date"
                  value={form.nextStepDate}
                  onChange={(e) => setForm({ ...form, nextStepDate: e.target.value })}
                />
              </Field>
              <Field label="Next Step" error={errors.nextStep} className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="e.g. Share shortlisted profiles with the panel"
                  value={form.nextStep}
                  onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Job Description">
            <Field label="JD Content" error={errors.jdContent}>
              <textarea
                className="input min-h-32 resize-y"
                placeholder="Role summary, responsibilities, must-have skills…"
                value={form.jdContent}
                onChange={(e) => setForm({ ...form, jdContent: e.target.value })}
              />
            </Field>
          </FormSection>
        </div>

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
