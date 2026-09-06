'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, UserSearch, X, Link2 } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatINR, parseSkills, SOURCE_LABELS, LIST_PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader,
  Modal,
  Field,
  EmptyState,
  TableShell,
  FormSection,
  Badge,
  Pagination,
  type Tone,
} from '@/components/ui';

type Row = {
  id: number;
  resourceId: number | null;
  name: string;
  email: string | null;
  mobile: string | null;
  currentDesignation: string | null;
  experienceYears: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  otherSkills: string;
  currentCtc: number | null;
  expectedCtc: number | null;
  noticePeriodDays: number | null;
  location: string | null;
  source: 'in_house' | 'partner' | 'agency';
  sourceName: string | null;
  notes: string | null;
  mappedCount: number;
  activeCount: number;
};

type ResourceOption = {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  designation: string | null;
  currentCtc: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
};

const SOURCE_TONE: Record<Row['source'], Tone> = {
  in_house: 'blue',
  partner: 'violet',
  agency: 'amber',
};

const BLANK = {
  name: '',
  email: '',
  mobile: '',
  currentDesignation: '',
  experienceYears: '',
  primarySkill: '',
  secondarySkill: '',
  otherSkills: [] as string[],
  currentCtc: '',
  expectedCtc: '',
  noticePeriodDays: '',
  location: '',
  source: 'in_house' as Row['source'],
  sourceName: '',
  resourceId: '',
  notes: '',
};

export default function CandidatesClient({
  initial,
  resources,
}: {
  initial: Row[];
  resources: ResourceOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | Row['source']>('all');
  const [skillFilter, setSkillFilter] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);
  const [skillDraft, setSkillDraft] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const skills = useMemo(() => {
    const set = new Set<string>();
    for (const c of initial) {
      if (c.primarySkill) set.add(c.primarySkill);
    }
    return [...set].sort();
  }, [initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((c) => {
      if (sourceFilter !== 'all' && c.source !== sourceFilter) return false;
      if (skillFilter && c.primarySkill !== skillFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.primarySkill ?? '').toLowerCase().includes(q) ||
        (c.currentDesignation ?? '').toLowerCase().includes(q) ||
        (c.sourceName ?? '').toLowerCase().includes(q)
      );
    });
  }, [initial, search, sourceFilter, skillFilter]);

  useEffect(() => setPage(1), [search, sourceFilter, skillFilter]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [filtered, page],
  );

  const counts = useMemo(
    () => ({
      all: initial.length,
      in_house: initial.filter((c) => c.source === 'in_house').length,
      partner: initial.filter((c) => c.source === 'partner').length,
      agency: initial.filter((c) => c.source === 'agency').length,
    }),
    [initial],
  );

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setSkillDraft('');
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  function openEdit(c: Row) {
    setEditing(c);
    setForm({
      name: c.name,
      email: c.email ?? '',
      mobile: c.mobile ?? '',
      currentDesignation: c.currentDesignation ?? '',
      experienceYears: c.experienceYears?.toString() ?? '',
      primarySkill: c.primarySkill ?? '',
      secondarySkill: c.secondarySkill ?? '',
      otherSkills: parseSkills(c.otherSkills),
      currentCtc: c.currentCtc?.toString() ?? '',
      expectedCtc: c.expectedCtc?.toString() ?? '',
      noticePeriodDays: c.noticePeriodDays?.toString() ?? '',
      location: c.location ?? '',
      source: c.source,
      sourceName: c.sourceName ?? '',
      resourceId: c.resourceId ? String(c.resourceId) : '',
      notes: c.notes ?? '',
    });
    setSkillDraft('');
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  /** Picking a bench resource pre-fills the profile from their record. */
  function pickResource(value: string) {
    const r = resources.find((x) => String(x.id) === value);
    if (!r) {
      setForm({ ...form, resourceId: '' });
      return;
    }
    setForm({
      ...form,
      resourceId: value,
      name: r.name,
      email: r.email,
      mobile: r.mobile ?? '',
      currentDesignation: r.designation ?? '',
      currentCtc: r.currentCtc?.toString() ?? '',
      primarySkill: r.primarySkill ?? '',
      secondarySkill: r.secondarySkill ?? '',
    });
  }

  function addSkill() {
    const s = skillDraft.trim();
    if (!s || form.otherSkills.includes(s)) return;
    setForm({ ...form, otherSkills: [...form.otherSkills, s] });
    setSkillDraft('');
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const payload = {
        ...form,
        experienceYears:
          form.experienceYears === '' ? undefined : Number(form.experienceYears),
        currentCtc: form.currentCtc === '' ? undefined : Number(form.currentCtc),
        expectedCtc: form.expectedCtc === '' ? undefined : Number(form.expectedCtc),
        noticePeriodDays:
          form.noticePeriodDays === '' ? undefined : Number(form.noticePeriodDays),
        // Only in-house candidates carry a bench link.
        resourceId: form.source === 'in_house' ? form.resourceId : '',
      };
      if (editing) {
        await api(`/api/candidates/${editing.id}`, { method: 'PUT', json: payload });
      } else {
        await api('/api/candidates', { method: 'POST', json: payload });
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Row) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await api(`/api/candidates/${c.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  const isInHouse = form.source === 'in_house';

  return (
    <div className="pb-12">
      <PageHeader
        title="Candidate Pool"
        subtitle="Bench and externally sourced candidates for open requirements"
        action={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Candidate
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search name, skill, agency…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['all', 'in_house', 'partner', 'agency'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                sourceFilter === s ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {s === 'all' ? 'All' : SOURCE_LABELS[s]}
              <span className="ml-1.5 opacity-60">{counts[s]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((s) => (
            <button
              key={s}
              onClick={() => setSkillFilter(skillFilter === s ? null : s)}
              className={`chip border transition-colors ${
                skillFilter === s
                  ? 'border-brand bg-brandbg text-brand'
                  : 'border-line bg-surface text-ink2 hover:bg-surface2'
              }`}
            >
              {s}
            </button>
          ))}
          {skillFilter && (
            <button
              onClick={() => setSkillFilter(null)}
              className="chip border border-line bg-surface text-ink3 hover:text-ink"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="px-6">
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={UserSearch}
              title={initial.length ? 'No matching candidates' : 'No candidates yet'}
              description={
                initial.length
                  ? 'Try a different search term or source filter.'
                  : 'Add candidates to map against open opportunities.'
              }
              action={
                !initial.length && (
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add Candidate
                  </button>
                )
              }
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Candidate</th>
                  <th className="th">Skills</th>
                  <th className="th">Source</th>
                  <th className="th text-right">Expected CTC</th>
                  <th className="th text-right">Notice</th>
                  <th className="th text-right">Mapped</th>
                  <th className="th w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((c) => (
                  <tr key={c.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">{c.name}</span>
                        {c.resourceId && (
                          <span title="Linked to a bench resource">
                            <Link2 className="h-3 w-3 text-brand" />
                          </span>
                        )}
                      </div>
                      <div className="text-2xs text-ink3">
                        {c.currentDesignation ?? '—'}
                        {c.experienceYears != null && ` · ${c.experienceYears} yrs`}
                        {c.location && ` · ${c.location}`}
                      </div>
                    </td>
                    <td className="td">
                      {c.primarySkill ? (
                        <div className="flex flex-wrap gap-1">
                          <Badge tone="blue">{c.primarySkill}</Badge>
                          {c.secondarySkill && (
                            <Badge tone="neutral">{c.secondarySkill}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td">
                      <Badge tone={SOURCE_TONE[c.source]}>
                        {SOURCE_LABELS[c.source]}
                      </Badge>
                      {c.sourceName && (
                        <div className="mt-0.5 text-2xs text-ink3">{c.sourceName}</div>
                      )}
                    </td>
                    <td className="td text-right">
                      <span className="tnum text-ink">{formatINR(c.expectedCtc)}</span>
                    </td>
                    <td className="td text-right">
                      <span className="tnum text-ink2">
                        {c.noticePeriodDays == null
                          ? '—'
                          : c.noticePeriodDays === 0
                            ? 'Immediate'
                            : `${c.noticePeriodDays}d`}
                      </span>
                    </td>
                    <td className="td text-right">
                      {c.mappedCount > 0 ? (
                        <Badge tone={c.activeCount > 0 ? 'green' : 'neutral'}>
                          {c.activeCount > 0
                            ? `${c.activeCount} live`
                            : `${c.mappedCount} closed`}
                        </Badge>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                          aria-label={`Edit ${c.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          aria-label={`Delete ${c.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
          {filtered.length > 0 && (
            <Pagination
              page={page}
              pageSize={LIST_PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
            />
          )}
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add Candidate'}
        description="Source attribution decides what else the form asks for"
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <div className="space-y-5">
          <FormSection title="Source">
            <div className="flex rounded-md border border-line bg-surface p-0.5">
              {(['in_house', 'partner', 'agency'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      source: s,
                      // Bench link and source name are mutually exclusive.
                      sourceName: s === 'in_house' ? '' : form.sourceName,
                      resourceId: s === 'in_house' ? form.resourceId : '',
                    })
                  }
                  className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    form.source === s ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>

            <div className="mt-3">
              {isInHouse ? (
                <Field
                  label="Link to a bench resource"
                  error={errors.resourceId}
                  hint="Optional — picking one fills the profile from their resource record"
                >
                  <select
                    className="input"
                    value={form.resourceId}
                    onChange={(e) => pickResource(e.target.value)}
                  >
                    <option value="">Not linked — enter details manually</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.designation ? ` — ${r.designation}` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field
                  label={form.source === 'partner' ? 'Partner Name' : 'Agency Name'}
                  required
                  error={errors.sourceName}
                >
                  <input
                    className="input"
                    placeholder={
                      form.source === 'partner'
                        ? 'e.g. Sattva Tech Partners'
                        : 'e.g. Zenith Recruitment'
                    }
                    value={form.sourceName}
                    onChange={(e) => setForm({ ...form, sourceName: e.target.value })}
                  />
                </Field>
              )}
            </div>
          </FormSection>

          <FormSection title="Profile">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required error={errors.name}>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Current Designation" error={errors.currentDesignation}>
                <input
                  className="input"
                  value={form.currentDesignation}
                  onChange={(e) =>
                    setForm({ ...form, currentDesignation: e.target.value })
                  }
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Mobile" error={errors.mobile}>
                <input
                  className="input"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </Field>
              <Field label="Experience (years)" error={errors.experienceYears}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.experienceYears}
                  onChange={(e) =>
                    setForm({ ...form, experienceYears: e.target.value })
                  }
                />
              </Field>
              <Field label="Location" error={errors.location}>
                <input
                  className="input"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Skills">
            <div className="grid gap-3 sm:grid-cols-2">
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
            </div>
            <div className="mt-3">
              <Field label="Other Skills">
                <div className="flex gap-2">
                  <input
                    className="input"
                    placeholder="Type a skill and press Enter"
                    value={skillDraft}
                    onChange={(e) => setSkillDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                  />
                  <button type="button" className="btn-ghost shrink-0" onClick={addSkill}>
                    Add
                  </button>
                </div>
              </Field>
              {form.otherSkills.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.otherSkills.map((s) => (
                    <span key={s} className="chip border border-line bg-surface2 text-ink2">
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            otherSkills: form.otherSkills.filter((x) => x !== s),
                          })
                        }
                        className="ml-0.5 text-ink3 hover:text-rose-600"
                        aria-label={`Remove ${s}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </FormSection>

          <FormSection title="Commercials">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Current CTC (₹/yr)" error={errors.currentCtc}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.currentCtc}
                  onChange={(e) => setForm({ ...form, currentCtc: e.target.value })}
                />
              </Field>
              <Field label="Expected CTC (₹/yr)" error={errors.expectedCtc}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.expectedCtc}
                  onChange={(e) => setForm({ ...form, expectedCtc: e.target.value })}
                />
              </Field>
              <Field
                label="Notice Period (days)"
                error={errors.noticePeriodDays}
                hint="0 for immediate joiners"
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.noticePeriodDays}
                  onChange={(e) =>
                    setForm({ ...form, noticePeriodDays: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="mt-3">
              <Field label="Notes" error={errors.notes}>
                <input
                  className="input"
                  placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Candidate'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
