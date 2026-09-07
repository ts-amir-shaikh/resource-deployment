'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Pencil, Trash2, Search, Users, X } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatMoney, formatDate, parseSkills, LIST_PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader,
  Modal,
  Field,
  Badge,
  EmptyState,
  TableShell,
  AllocationBar,
  FormSection,
  Pagination,
} from '@/components/ui';

type Row = {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  designation: string | null;
  currentCtc: number | null;
  revisedCtc: number | null;
  revisedEffectiveFrom: string | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  otherSkills: string;
  billable: number;
  shadow: number;
  allocated: number;
};

const BLANK = {
  name: '',
  email: '',
  mobile: '',
  designation: '',
  currentCtc: '',
  revisedCtc: '',
  revisedEffectiveFrom: '',
  primarySkill: '',
  secondarySkill: '',
  otherSkills: [] as string[],
};

export default function ResourcesClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'all' | 'available' | 'partial' | 'full'>(
    'all',
  );
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
    for (const r of initial) {
      if (r.primarySkill) set.add(r.primarySkill);
    }
    return [...set].sort();
  }, [initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((r) => {
      if (skillFilter && r.primarySkill !== skillFilter) return false;
      if (availability === 'available' && r.allocated !== 0) return false;
      if (availability === 'full' && r.allocated < 100) return false;
      if (availability === 'partial' && (r.allocated === 0 || r.allocated >= 100)) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.designation ?? '').toLowerCase().includes(q) ||
        (r.primarySkill ?? '').toLowerCase().includes(q)
      );
    });
  }, [initial, search, skillFilter, availability]);

  // Any filter change should land the user back on page 1 rather than a now
  // out-of-range page.
  useEffect(() => setPage(1), [search, skillFilter, availability]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [filtered, page],
  );

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setSkillDraft('');
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      name: r.name,
      email: r.email,
      mobile: r.mobile ?? '',
      designation: r.designation ?? '',
      currentCtc: r.currentCtc?.toString() ?? '',
      revisedCtc: r.revisedCtc?.toString() ?? '',
      revisedEffectiveFrom: r.revisedEffectiveFrom ?? '',
      primarySkill: r.primarySkill ?? '',
      secondarySkill: r.secondarySkill ?? '',
      otherSkills: parseSkills(r.otherSkills),
    });
    setSkillDraft('');
    setErrors({});
    setBanner(null);
    setOpen(true);
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
        currentCtc: form.currentCtc === '' ? undefined : Number(form.currentCtc),
        revisedCtc: form.revisedCtc === '' ? undefined : Number(form.revisedCtc),
      };
      if (editing) {
        await api(`/api/resources/${editing.id}`, { method: 'PUT', json: payload });
      } else {
        await api('/api/resources', { method: 'POST', json: payload });
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

  async function remove(r: Row) {
    if (!confirm(`Delete ${r.name}? This cannot be undone.`)) return;
    try {
      await api(`/api/resources/${r.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Resources"
        subtitle={`${initial.length} consultants on the bench`}
        action={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Resource
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search name, email, skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['all', 'available', 'partial', 'full'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAvailability(a)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium capitalize transition-colors ${
                availability === a ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {a}
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
              icon={Users}
              title={initial.length ? 'No matching resources' : 'No resources yet'}
              description={
                initial.length
                  ? 'Try a different search term, or clear the skill and availability filters.'
                  : 'Add your first consultant to start tracking deployments.'
              }
              action={
                !initial.length && (
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add Resource
                  </button>
                )
              }
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Resource</th>
                  <th className="th">Primary Skill</th>
                  <th className="th">CTC</th>
                  <th className="th w-44">Utilisation</th>
                  <th className="th w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((r) => (
                  <tr key={r.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <Link
                        href={`/resources/${r.id}`}
                        className="font-medium text-ink hover:text-brand"
                      >
                        {r.name}
                      </Link>
                      <div className="text-2xs text-ink3">
                        {r.designation ?? '—'} · {r.email}
                      </div>
                    </td>
                    <td className="td">
                      {r.primarySkill ? (
                        <div className="flex flex-wrap gap-1">
                          <Badge tone="blue">{r.primarySkill}</Badge>
                          {r.secondarySkill && (
                            <Badge tone="neutral">{r.secondarySkill}</Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td">
                      <div className="tnum text-ink">{formatMoney(r.currentCtc, 'INR')}</div>
                      {r.revisedCtc && (
                        <div className="text-2xs text-emerald-600 dark:text-emerald-400">
                          → {formatMoney(r.revisedCtc, 'INR')} from{' '}
                          {formatDate(r.revisedEffectiveFrom)}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      {r.allocated === 0 ? (
                        <Badge tone="neutral">Available</Badge>
                      ) : (
                        <AllocationBar billable={r.billable} shadow={r.shadow} />
                      )}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(r)}
                          className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                          aria-label={`Edit ${r.name}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(r)}
                          className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          aria-label={`Delete ${r.name}`}
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
        title={editing ? `Edit ${editing.name}` : 'Add Resource'}
        description="Consultant profile, compensation and skills"
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <div className="space-y-5">
          <FormSection title="Identity">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" required error={errors.name}>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Email" required error={errors.email}>
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
              <Field label="Designation" error={errors.designation}>
                <input
                  className="input"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Compensation">
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
              <Field label="Revised CTC (₹/yr)" error={errors.revisedCtc}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.revisedCtc}
                  onChange={(e) => setForm({ ...form, revisedCtc: e.target.value })}
                />
              </Field>
              <Field
                label="Effective From"
                error={errors.revisedEffectiveFrom}
                hint="Required when a revised CTC is set"
              >
                <input
                  className="input"
                  type="date"
                  value={form.revisedEffectiveFrom}
                  onChange={(e) =>
                    setForm({ ...form, revisedEffectiveFrom: e.target.value })
                  }
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
              <Field label="Other Skills" error={errors.otherSkills}>
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
                    <span
                      key={s}
                      className="chip border border-line bg-surface2 text-ink2"
                    >
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
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Resource'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
