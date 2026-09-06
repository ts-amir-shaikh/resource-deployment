'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  FileSignature,
  RefreshCw,
  History,
  Trash2,
  X,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatINR, formatINRCompact, formatDate, today } from '@/lib/utils';
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
  projectId: number;
  parentAgreementId: number | null;
  agreementNumber: string | null;
  title: string;
  scope: 'individual' | 'team';
  value: number;
  startDate: string;
  endDate: string;
  renewalVersion: number;
  status: 'active' | 'expired' | 'renewed';
  notes: string | null;
  projectName: string;
  clientName: string;
  resourceCount: number;
  daysToExpiry: number | null;
};

type ProjectOption = { id: number; projectName: string; clientName: string };
type ResourceOption = { id: number; name: string; designation: string | null };
type ResourceLine = { resourceId: string; billingAmount: string };

type HistoryVersion = {
  id: number;
  title: string;
  agreementNumber: string | null;
  value: number;
  startDate: string;
  endDate: string;
  renewalVersion: number;
  status: string;
  notes: string | null;
  resources: { resourceId: number; resourceName: string; billingAmount: number }[];
  diff: {
    valueDelta: number;
    valuePctChange: number | null;
    added: { resourceName: string }[];
    removed: { resourceName: string }[];
    retained: { resourceName: string }[];
  } | null;
};

const STATUS_TONE: Record<Row['status'], Tone> = {
  active: 'green',
  expired: 'neutral',
  renewed: 'violet',
};

const BLANK = {
  projectId: '',
  agreementNumber: '',
  title: '',
  scope: 'individual' as 'individual' | 'team',
  value: '',
  startDate: today(),
  endDate: '',
  notes: '',
};

export default function AgreementsClient({
  initial,
  projects,
  resources,
}: {
  initial: Row[];
  projects: ProjectOption[];
  resources: ResourceOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'renewed'>('active');

  const [open, setOpen] = useState(false);
  /** null = creating new; a Row = renewing that version */
  const [renewingFrom, setRenewingFrom] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);
  const [lines, setLines] = useState<ResourceLine[]>([
    { resourceId: '', billingAmount: '' },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [historyFor, setHistoryFor] = useState<Row | null>(null);
  const [history, setHistory] = useState<HistoryVersion[] | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        (a.agreementNumber ?? '').toLowerCase().includes(q) ||
        a.clientName.toLowerCase().includes(q) ||
        a.projectName.toLowerCase().includes(q)
      );
    });
  }, [initial, search, statusFilter]);

  const linesTotal = lines.reduce((s, l) => s + (Number(l.billingAmount) || 0), 0);

  function openCreate() {
    setRenewingFrom(null);
    setForm(BLANK);
    setLines([{ resourceId: '', billingAmount: '' }]);
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  async function openRenew(a: Row) {
    setRenewingFrom(a);
    setErrors({});
    setBanner(null);
    // Pre-fill from the version being renewed; the user edits price/resources.
    setForm({
      projectId: String(a.projectId),
      agreementNumber: '',
      title: a.title,
      scope: a.scope,
      value: String(a.value),
      startDate: a.endDate,
      endDate: '',
      notes: '',
    });
    setLines([{ resourceId: '', billingAmount: '' }]);
    setOpen(true);

    try {
      const detail = await api<{
        resources: { resourceId: number; billingAmount: number }[];
      }>(`/api/agreements/${a.id}`);
      setLines(
        detail.resources.length
          ? detail.resources.map((r) => ({
              resourceId: String(r.resourceId),
              billingAmount: String(r.billingAmount),
            }))
          : [{ resourceId: '', billingAmount: '' }],
      );
    } catch {
      // Leave the blank line in place; the user can re-pick resources.
    }
  }

  async function openHistory(a: Row) {
    setHistoryFor(a);
    setHistory(null);
    try {
      setHistory(await api<HistoryVersion[]>(`/api/agreements/${a.id}/history`));
    } catch (e) {
      setBanner(errorMessage(e));
    }
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const payload = {
        ...form,
        value: Number(form.value) || 0,
        resources: lines
          .filter((l) => l.resourceId !== '')
          .map((l) => ({
            resourceId: Number(l.resourceId),
            billingAmount: Number(l.billingAmount) || 0,
          })),
      };
      const url = renewingFrom
        ? `/api/agreements/${renewingFrom.id}/renew`
        : '/api/agreements';
      await api(url, { method: 'POST', json: payload });
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Row) {
    if (!confirm(`Delete "${a.title}" (v${a.renewalVersion})?`)) return;
    try {
      await api(`/api/agreements/${a.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Agreements & POs"
        subtitle="Purchase orders and agreements, with full renewal history"
        action={
          <button className="btn-primary" onClick={openCreate} disabled={!projects.length}>
            <Plus className="h-4 w-4" /> Add Agreement
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search PO number, title, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['active', 'renewed', 'expired', 'all'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                statusFilter === s ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6">
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={FileSignature}
              title={initial.length ? 'No matching agreements' : 'No agreements yet'}
              description={
                projects.length
                  ? initial.length
                    ? 'Try a different filter or search term.'
                    : 'Raise a PO or agreement against a project to start tracking renewals.'
                  : 'Add a project first — agreements bind to one.'
              }
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Agreement</th>
                  <th className="th">Project / Client</th>
                  <th className="th">Scope</th>
                  <th className="th">Period</th>
                  <th className="th text-right">Value</th>
                  <th className="th">Status</th>
                  <th className="th w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((a) => {
                  const expiringSoon =
                    a.status === 'active' &&
                    a.daysToExpiry !== null &&
                    a.daysToExpiry <= 30;
                  return (
                    <tr key={a.id} className="hover:bg-surface2/50">
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{a.title}</span>
                          {a.renewalVersion > 1 && (
                            <Badge tone="violet">v{a.renewalVersion}</Badge>
                          )}
                        </div>
                        <div className="font-mono text-2xs text-ink3">
                          {a.agreementNumber ?? '—'}
                        </div>
                      </td>
                      <td className="td">
                        <div className="text-ink">{a.projectName}</div>
                        <div className="text-2xs text-ink3">{a.clientName}</div>
                      </td>
                      <td className="td">
                        <Badge tone={a.scope === 'team' ? 'blue' : 'neutral'}>
                          {a.scope === 'team' ? 'Team' : 'Individual'}
                        </Badge>
                        <div className="mt-0.5 text-2xs text-ink3">
                          {a.resourceCount} resource{a.resourceCount === 1 ? '' : 's'}
                        </div>
                      </td>
                      <td className="td">
                        <div className="tnum text-ink">{formatDate(a.startDate)}</div>
                        <div
                          className={`tnum text-2xs ${expiringSoon ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-ink3'}`}
                        >
                          → {formatDate(a.endDate)}
                          {expiringSoon &&
                            ` · ${a.daysToExpiry}d left`}
                        </div>
                      </td>
                      <td className="td text-right">
                        <span className="tnum font-medium text-ink">
                          {formatINRCompact(a.value)}
                        </span>
                      </td>
                      <td className="td">
                        <Badge tone={STATUS_TONE[a.status]}>
                          {a.status === 'renewed'
                            ? 'Renewed'
                            : a.status === 'expired'
                              ? 'Expired'
                              : 'Active'}
                        </Badge>
                      </td>
                      <td className="td text-right">
                        <div className="flex justify-end gap-1">
                          {a.renewalVersion > 1 || a.status === 'renewed' ? (
                            <button
                              onClick={() => openHistory(a)}
                              className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                              title="Renewal history"
                              aria-label={`History for ${a.title}`}
                            >
                              <History className="h-3.5 w-3.5" />
                            </button>
                          ) : null}
                          {a.status !== 'renewed' && (
                            <button
                              onClick={() => openRenew(a)}
                              className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                              title="Renew"
                              aria-label={`Renew ${a.title}`}
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => remove(a)}
                            className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                            aria-label={`Delete ${a.title}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>

      {/* Create / renew */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={renewingFrom ? `Renew: ${renewingFrom.title}` : 'Add Agreement'}
        description={
          renewingFrom
            ? `Creates v${renewingFrom.renewalVersion + 1}. The current version is preserved and marked Renewed.`
            : 'PO or agreement bound to a project, covering one resource or a team'
        }
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        {renewingFrom && (
          <div className="mb-4 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300">
            Renewing from v{renewingFrom.renewalVersion} ·{' '}
            {formatINR(renewingFrom.value)} · ended {formatDate(renewingFrom.endDate)}.
            Adjust the value and resources below — both versions stay in the history.
          </div>
        )}

        <div className="space-y-5">
          <FormSection title="Agreement">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project" required error={errors.projectId}>
                <select
                  className="input"
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  disabled={Boolean(renewingFrom)}
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clientName} — {p.projectName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="PO / Agreement Number" error={errors.agreementNumber}>
                <input
                  className="input font-mono"
                  placeholder="e.g. NW/PO/2025-0207"
                  value={form.agreementNumber}
                  onChange={(e) =>
                    setForm({ ...form, agreementNumber: e.target.value })
                  }
                />
              </Field>
              <Field label="Title" required error={errors.title} className="sm:col-span-2">
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Commercial Terms">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Scope" required>
                <div className="flex rounded-md border border-line bg-surface p-0.5">
                  {(['individual', 'team'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setForm({ ...form, scope: s });
                        if (s === 'individual') setLines(lines.slice(0, 1));
                      }}
                      className={`flex-1 rounded px-2 py-1.5 text-sm font-medium capitalize transition-colors ${
                        form.scope === s
                          ? 'bg-brand text-white'
                          : 'text-ink2 hover:text-ink'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Total Value (₹)" required error={errors.value}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                />
              </Field>
              <Field label="Notes" error={errors.notes}>
                <input
                  className="input"
                  placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
              <Field label="Start Date" required error={errors.startDate}>
                <input
                  className="input"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </Field>
              <Field label="End Date" required error={errors.endDate}>
                <input
                  className="input"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Resources Covered">
            {errors.resources && (
              <p className="mb-2 text-xs text-rose-600 dark:text-rose-400">
                {errors.resources}
              </p>
            )}
            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    className="input flex-1"
                    value={line.resourceId}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], resourceId: e.target.value };
                      setLines(next);
                    }}
                  >
                    <option value="">Select a resource…</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.designation ? ` — ${r.designation}` : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input w-40"
                    type="number"
                    min={0}
                    placeholder="₹/month"
                    value={line.billingAmount}
                    onChange={(e) => {
                      const next = [...lines];
                      next[i] = { ...next[i], billingAmount: e.target.value };
                      setLines(next);
                    }}
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines(lines.filter((_, x) => x !== i))}
                      className="rounded-md border border-line px-2 text-ink3 hover:text-rose-600"
                      aria-label="Remove resource line"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between">
              {form.scope === 'team' ? (
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setLines([...lines, { resourceId: '', billingAmount: '' }])
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> Add Resource
                </button>
              ) : (
                <span className="text-2xs text-ink3">
                  An individual agreement covers exactly one resource
                </span>
              )}
              {linesTotal > 0 && (
                <span className="tnum text-xs text-ink2">
                  Monthly total: <strong className="text-ink">{formatINR(linesTotal)}</strong>
                </span>
              )}
            </div>
          </FormSection>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving
              ? 'Saving…'
              : renewingFrom
                ? `Create v${renewingFrom.renewalVersion + 1}`
                : 'Add Agreement'}
          </button>
        </div>
      </Modal>

      {/* Renewal history */}
      <Modal
        open={Boolean(historyFor)}
        onClose={() => setHistoryFor(null)}
        title="Renewal History"
        description={historyFor?.title}
        wide
      >
        {!history ? (
          <p className="py-8 text-center text-sm text-ink3">Loading history…</p>
        ) : (
          <ol className="space-y-3">
            {history.map((v) => (
              <li key={v.id} className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="violet">v{v.renewalVersion}</Badge>
                    <span className="font-mono text-2xs text-ink3">
                      {v.agreementNumber ?? '—'}
                    </span>
                    <Badge tone={v.status === 'active' ? 'green' : 'neutral'}>
                      {v.status}
                    </Badge>
                  </div>
                  <div className="tnum text-sm font-semibold text-ink">
                    {formatINR(v.value)}
                  </div>
                </div>

                <div className="tnum mt-1 text-2xs text-ink3">
                  {formatDate(v.startDate)} → {formatDate(v.endDate)}
                </div>

                {v.diff && (
                  <div className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
                    <div className="flex items-center gap-1.5">
                      {v.diff.valueDelta >= 0 ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                      )}
                      <span
                        className={
                          v.diff.valueDelta >= 0
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-rose-700 dark:text-rose-400'
                        }
                      >
                        {v.diff.valueDelta >= 0 ? '+' : ''}
                        {formatINR(v.diff.valueDelta)}
                        {v.diff.valuePctChange !== null &&
                          ` (${v.diff.valuePctChange >= 0 ? '+' : ''}${v.diff.valuePctChange.toFixed(1)}%)`}
                      </span>
                      <span className="text-ink3">vs previous version</span>
                    </div>

                    {v.diff.added.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-ink3">Added:</span>
                        {v.diff.added.map((r) => (
                          <Badge key={r.resourceName} tone="green">
                            + {r.resourceName}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {v.diff.removed.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-ink3">Removed:</span>
                        {v.diff.removed.map((r) => (
                          <Badge key={r.resourceName} tone="rose">
                            − {r.resourceName}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {v.diff.retained.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-ink3">Retained:</span>
                        {v.diff.retained.map((r) => (
                          <Badge key={r.resourceName} tone="neutral">
                            {r.resourceName}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!v.diff && v.resources.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-3 text-xs">
                    <span className="text-ink3">Resources:</span>
                    {v.resources.map((r) => (
                      <Badge key={r.resourceId} tone="neutral">
                        {r.resourceName}
                      </Badge>
                    ))}
                  </div>
                )}

                {v.notes && (
                  <p className="mt-2 text-xs italic text-ink2">{v.notes}</p>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-6 flex justify-end border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setHistoryFor(null)}>
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
}
