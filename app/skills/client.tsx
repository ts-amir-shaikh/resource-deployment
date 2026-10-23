'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search, Settings2, Sparkles } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import type { MatrixResource, SkillMatrix } from '@/lib/reviews';
import { SKILL_LEVELS, SKILL_LEVEL_LABELS } from '@/lib/review-rules';
import { Badge, EmptyState, Field, Modal, PageHeader, TableShell, type Tone } from '@/components/ui';

const LEVEL_TONE: Record<number, Tone> = { 1: 'neutral', 2: 'neutral', 3: 'blue', 4: 'violet', 5: 'green' };

export default function SkillsClient({ matrix, canWrite }: { matrix: SkillMatrix; canWrite: boolean }) {
  const router = useRouter();
  const skillName = useMemo(() => new Map(matrix.skills.map((s) => [s.id, s.name])), [matrix.skills]);
  const activeSkills = matrix.skills.filter((s) => s.active);

  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [minLevel, setMinLevel] = useState('1');

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sid = Number(skillFilter) || null;
    const min = Number(minLevel) || 1;
    return matrix.resources
      .filter((r) => !q || r.name.toLowerCase().includes(q) || (r.designation ?? '').toLowerCase().includes(q))
      .filter((r) => sid === null || r.levels.some((l) => l.skillId === sid && l.level >= min))
      .map((r) => ({
        ...r,
        // Strongest first, so the chips read as a profile.
        levels: [...r.levels].sort((a, b) => b.level - a.level || (skillName.get(a.skillId) ?? '').localeCompare(skillName.get(b.skillId) ?? '')),
      }));
  }, [matrix.resources, search, skillFilter, minLevel, skillName]);

  const [editing, setEditing] = useState<MatrixResource | null>(null);
  const [catalogueOpen, setCatalogueOpen] = useState(false);

  return (
    <div className="pb-12">
      <PageHeader
        title="Skill Matrix"
        subtitle={`${matrix.resources.length} resources · ${activeSkills.length} skills · levels 1 (beginner) to 5 (expert)`}
        action={
          <button className="btn-ghost" onClick={() => setCatalogueOpen(true)}>
            <Settings2 className="h-4 w-4" /> Skills list
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink3" />
          <input className="input w-56 pl-8" placeholder="Search resource" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-56" value={skillFilter} onChange={(e) => setSkillFilter(e.target.value)} aria-label="Skill">
          <option value="">Any skill</option>
          {matrix.skills.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.active ? '' : ' (retired)'}
            </option>
          ))}
        </select>
        <select className="input w-44" value={minLevel} onChange={(e) => setMinLevel(e.target.value)} aria-label="Minimum level" disabled={!skillFilter}>
          {SKILL_LEVELS.map((l) => (
            <option key={l} value={l}>
              {l === 1 ? 'Any level' : `${l}+ ${SKILL_LEVEL_LABELS[l]}`}
            </option>
          ))}
        </select>
      </div>
      <div className="px-6 py-4">
        <div className="card overflow-hidden">
          {matrix.resources.length === 0 ? (
            <EmptyState icon={Sparkles} title="No resources yet" description="Resources added by Admin appear here to be assessed." />
          ) : rows.length === 0 ? (
            <EmptyState icon={Search} title="Nobody matches" description="Try another skill or a lower level." />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Resource</th>
                  <th className="th">Assessed skills</th>
                  <th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-surface2/50">
                    <td className="td align-top">
                      <div className="font-medium text-ink">{r.name}</div>
                      <div className="text-xs text-ink3">{[r.designation, r.primarySkill].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td className="td">
                      {r.levels.length === 0 ? (
                        <span className="text-sm text-ink3">Not assessed</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.levels.map((l) => (
                            <Badge key={l.skillId} tone={LEVEL_TONE[l.level] ?? 'neutral'}>
                              {skillName.get(l.skillId) ?? 'Unknown'} · {l.level}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="td text-right align-top">
                      {canWrite && (
                        <button className="btn-ghost" onClick={() => setEditing(r)}>
                          <Pencil className="h-4 w-4" /> Assess
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>

      {editing && (
        <AssessModal
          resource={editing}
          matrix={matrix}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      <CatalogueModal open={catalogueOpen} onClose={() => setCatalogueOpen(false)} matrix={matrix} canWrite={canWrite} />
    </div>
  );
}

/** A resource's levels, edited together. "—" removes a skill from their profile. */
function AssessModal({
  resource,
  matrix,
  onClose,
  onSaved,
}: {
  resource: MatrixResource;
  matrix: SkillMatrix;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [levels, setLevels] = useState<Record<number, string>>(() =>
    Object.fromEntries(resource.levels.map((l) => [l.skillId, String(l.level)])),
  );
  const [filter, setFilter] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Active skills, plus any retired one this resource already has a level on.
  const shown = matrix.skills.filter(
    (s) => (s.active || levels[s.id]) && (!filter.trim() || s.name.toLowerCase().includes(filter.trim().toLowerCase())),
  );

  async function save() {
    setSaving(true);
    setBanner(null);
    try {
      const payload = Object.entries(levels)
        .filter(([, v]) => v !== '')
        .map(([skillId, level]) => ({ skillId: Number(skillId), level: Number(level) }));
      await api(`/api/skills/resources/${resource.id}`, { method: 'PUT', json: { levels: payload } });
      onSaved();
    } catch (e) {
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assess ${resource.name}`} description="Set a level for each skill they have. Leave the rest at —." wide>
      <div className="space-y-3">
        {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
        <input className="input" placeholder="Find a skill" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {matrix.skills.length === 0 ? (
          <p className="text-sm text-ink3">The skills list is empty. Add skills from “Skills list” first.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {shown.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
                <span className={s.active ? 'text-sm text-ink' : 'text-sm text-ink3'}>
                  {s.name}
                  {!s.active && ' (retired)'}
                </span>
                <select
                  className="input w-44"
                  aria-label={`${s.name} level`}
                  value={levels[s.id] ?? ''}
                  disabled={!s.active}
                  onChange={(e) => setLevels({ ...levels, [s.id]: e.target.value })}
                >
                  <option value="">—</option>
                  {SKILL_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l} · {SKILL_LEVEL_LABELS[l]}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save levels'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** The catalogue: add, rename, retire, restore. Never delete — recorded levels stay. */
function CatalogueModal({
  open,
  onClose,
  matrix,
  canWrite,
}: {
  open: boolean;
  onClose: () => void;
  matrix: SkillMatrix;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setBanner(null);
    setError(undefined);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      if (isApiError(e) && e.fields?.name) setError(e.fields.name);
      else setBanner(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Skills list" description="The skills resources are assessed on. A retired skill is not offered for new levels; existing ones stay.">
      <div className="space-y-4">
        {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
        {canWrite && (
          <div className="flex items-end gap-2">
            <Field label="New skill" error={error} className="flex-1">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kubernetes" />
            </Field>
            <button
              className="btn-primary"
              disabled={busy || !name.trim()}
              onClick={async () => {
                if (await run(() => api('/api/skills', { method: 'POST', json: { name } }))) setName('');
              }}
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        )}
        {matrix.skills.length === 0 ? (
          <p className="text-sm text-ink3">No skills yet.</p>
        ) : (
          <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {matrix.skills.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                {renaming?.id === s.id ? (
                  <input
                    className="input flex-1"
                    value={renaming.name}
                    autoFocus
                    onChange={(e) => setRenaming({ id: s.id, name: e.target.value })}
                  />
                ) : (
                  <span className={s.active ? 'text-sm text-ink' : 'text-sm text-ink3 line-through'}>
                    {s.name} <span className="text-xs text-ink3 no-underline">· {s.resources}</span>
                  </span>
                )}
                {canWrite && (
                  <span className="flex shrink-0 gap-1">
                    {renaming?.id === s.id ? (
                      <>
                        <button className="btn-ghost" onClick={() => setRenaming(null)}>
                          Cancel
                        </button>
                        <button
                          className="btn-primary"
                          disabled={busy || !renaming.name.trim()}
                          onClick={async () => {
                            if (await run(() => api(`/api/skills/${s.id}`, { method: 'PUT', json: { name: renaming.name } }))) setRenaming(null);
                          }}
                        >
                          Save
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn-ghost" disabled={busy} onClick={() => setRenaming({ id: s.id, name: s.name })}>
                          Rename
                        </button>
                        <button
                          className="btn-ghost"
                          disabled={busy}
                          onClick={() => run(() => api(`/api/skills/${s.id}`, { method: 'PUT', json: { active: !s.active } }))}
                        >
                          {s.active ? 'Retire' : 'Restore'}
                        </button>
                      </>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
