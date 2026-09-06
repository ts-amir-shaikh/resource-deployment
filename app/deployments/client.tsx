'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Search, Network, CircleStop, AlertTriangle } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatINR, formatDate, today, GST_RATE, LIST_PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader,
  Modal,
  Field,
  EmptyState,
  TableShell,
  FormSection,
  Badge,
  AllocationBar,
  Pagination,
} from '@/components/ui';

type Row = {
  id: number;
  resourceId: number;
  projectId: number;
  resourceName: string;
  designation: string | null;
  projectName: string;
  clientName: string;
  deploymentType: 'billable' | 'shadow';
  allocationPercentage: number;
  startDate: string;
  endDate: string | null;
  billingAmount: number;
  commissionAmount: number;
  gstApplicable: boolean;
  status: 'active' | 'ended';
};

type ResourceOption = {
  id: number;
  name: string;
  designation: string | null;
  billable: number;
  shadow: number;
  total: number;
  free: number;
};

type ProjectOption = { id: number; projectName: string; clientName: string };

const BLANK = {
  resourceId: '',
  projectId: '',
  deploymentType: 'billable' as 'billable' | 'shadow',
  allocationPercentage: '100',
  startDate: today(),
  endDate: '',
  billingAmount: '',
  commissionAmount: '',
  gstApplicable: true,
};

export default function DeploymentsClient({
  initial,
  resources,
  projects,
}: {
  initial: Row[];
  resources: ResourceOption[];
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'ended'>('active');
  const [typeFilter, setTypeFilter] = useState<'all' | 'billable' | 'shadow'>('all');
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [endingRow, setEndingRow] = useState<Row | null>(null);
  const [endDate, setEndDate] = useState(today());
  const [endError, setEndError] = useState<string | null>(null);

  const clientOptions = useMemo(() => {
    const set = new Set(initial.map((d) => d.clientName));
    return [...set].sort();
  }, [initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      if (typeFilter !== 'all' && d.deploymentType !== typeFilter) return false;
      if (clientFilter && d.clientName !== clientFilter) return false;
      if (!q) return true;
      return (
        d.resourceName.toLowerCase().includes(q) ||
        d.projectName.toLowerCase().includes(q) ||
        d.clientName.toLowerCase().includes(q)
      );
    });
  }, [initial, statusFilter, typeFilter, clientFilter, search]);

  useEffect(() => setPage(1), [search, statusFilter, typeFilter, clientFilter]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [filtered, page],
  );

  // Live headroom for the resource selected in the form. When editing an
  // active record, its own allocation is added back so it isn't double-counted.
  const selectedResource = resources.find((r) => r.id === Number(form.resourceId));
  const ownAllocation =
    editing && editing.status === 'active' && editing.resourceId === Number(form.resourceId)
      ? editing.allocationPercentage
      : 0;
  const headroom = selectedResource
    ? Math.min(100, selectedResource.free + ownAllocation)
    : 100;
  const requested = Number(form.allocationPercentage) || 0;
  const overAllocated = Boolean(selectedResource) && requested > headroom;

  const isShadow = form.deploymentType === 'shadow';
  const billingPreview = useMemo(() => {
    const base = Number(form.billingAmount) || 0;
    const gst = form.gstApplicable && !isShadow ? base * GST_RATE : 0;
    const commission = Number(form.commissionAmount) || 0;
    return { base, gst, total: base + gst, margin: base - commission };
  }, [form.billingAmount, form.commissionAmount, form.gstApplicable, isShadow]);

  // Shadow deployments carry no billing; clear the fields when the type flips.
  useEffect(() => {
    if (isShadow) {
      setForm((f) =>
        f.billingAmount === '' && f.commissionAmount === '' && !f.gstApplicable
          ? f
          : { ...f, billingAmount: '', commissionAmount: '', gstApplicable: false },
      );
    }
  }, [isShadow]);

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  function openEdit(d: Row) {
    setEditing(d);
    setForm({
      resourceId: String(d.resourceId),
      projectId: String(d.projectId),
      deploymentType: d.deploymentType,
      allocationPercentage: String(d.allocationPercentage),
      startDate: d.startDate,
      endDate: d.endDate ?? '',
      billingAmount: d.billingAmount ? String(d.billingAmount) : '',
      commissionAmount: d.commissionAmount ? String(d.commissionAmount) : '',
      gstApplicable: d.gstApplicable,
    });
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
        billingAmount: form.billingAmount === '' ? 0 : Number(form.billingAmount),
        commissionAmount:
          form.commissionAmount === '' ? 0 : Number(form.commissionAmount),
      };
      if (editing) {
        await api(`/api/deployments/${editing.id}`, { method: 'PUT', json: payload });
      } else {
        await api('/api/deployments', { method: 'POST', json: payload });
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

  async function endDeployment() {
    if (!endingRow) return;
    setEndError(null);
    try {
      await api(`/api/deployments/${endingRow.id}/end`, {
        method: 'POST',
        json: { endDate },
      });
      setEndingRow(null);
      router.refresh();
    } catch (e) {
      setEndError(errorMessage(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Deployments"
        subtitle="Resource-to-project mappings, billable and shadow"
        action={
          <button
            className="btn-primary"
            onClick={openCreate}
            disabled={!resources.length || !projects.length}
          >
            <Plus className="h-4 w-4" /> Add Deployment
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search resource, project, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['active', 'ended', 'all'] as const).map((s) => (
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

        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['all', 'billable', 'shadow'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                typeFilter === t ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <select
          className="input max-w-56"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          aria-label="Filter by client"
        >
          <option value="">All clients</option>
          {clientOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="px-6">
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Network}
              title={initial.length ? 'No matching deployments' : 'No deployments yet'}
              description={
                resources.length && projects.length
                  ? initial.length
                    ? 'Try a different filter or search term.'
                    : 'Deploy a resource to a project to start tracking billing.'
                  : 'Add resources and projects first.'
              }
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Resource</th>
                  <th className="th">Project / Client</th>
                  <th className="th">Type</th>
                  <th className="th">Period</th>
                  <th className="th text-right">Billing</th>
                  <th className="th w-24 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((d) => (
                  <tr
                    key={d.id}
                    className={`hover:bg-surface2/50 ${d.status === 'ended' ? 'opacity-60' : ''}`}
                  >
                    <td className="td">
                      <div className="font-medium text-ink">{d.resourceName}</div>
                      <div className="text-2xs text-ink3">{d.designation ?? '—'}</div>
                    </td>
                    <td className="td">
                      <div className="text-ink">{d.projectName}</div>
                      <div className="text-2xs text-ink3">{d.clientName}</div>
                    </td>
                    <td className="td">
                      <div className="flex flex-col items-start gap-1">
                        <Badge tone={d.deploymentType === 'shadow' ? 'amber' : 'green'}>
                          {d.deploymentType === 'shadow' ? 'Shadow' : 'Billable'}
                        </Badge>
                        <span className="tnum text-2xs text-ink2">
                          {d.allocationPercentage}% allocated
                        </span>
                      </div>
                    </td>
                    <td className="td">
                      <div className="tnum text-ink">{formatDate(d.startDate)}</div>
                      <div className="tnum text-2xs text-ink3">
                        {d.endDate ? `→ ${formatDate(d.endDate)}` : 'ongoing'}
                      </div>
                    </td>
                    <td className="td text-right">
                      {d.deploymentType === 'shadow' ? (
                        <span className="text-ink3">—</span>
                      ) : (
                        <>
                          <div className="tnum font-medium text-ink">
                            {formatINR(d.billingAmount)}
                          </div>
                          <div className="tnum text-2xs text-ink3">
                            {d.gstApplicable
                              ? `+${formatINR(d.billingAmount * GST_RATE)} GST`
                              : 'no GST'}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        {d.status === 'active' && (
                          <button
                            onClick={() => {
                              setEndingRow(d);
                              setEndDate(today());
                              setEndError(null);
                            }}
                            className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                            aria-label={`End deployment for ${d.resourceName}`}
                            title="End deployment"
                          >
                            <CircleStop className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(d)}
                          className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                          aria-label={`Edit deployment for ${d.resourceName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
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

      {/* Create / edit */}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit Deployment' : 'Add Deployment'}
        description="Allocation is capped at 100% across a resource's active deployments"
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <div className="space-y-5">
          <FormSection title="Assignment">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Resource" required error={errors.resourceId}>
                <select
                  className="input"
                  value={form.resourceId}
                  onChange={(e) => setForm({ ...form, resourceId: e.target.value })}
                >
                  <option value="">Select a resource…</option>
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} — {r.free}% free
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project" required error={errors.projectId}>
                <select
                  className="input"
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clientName} — {p.projectName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {/* Live allocation picture for the chosen resource */}
            {selectedResource && (
              <div className="mt-3 rounded-md border border-line bg-surface2 p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-xs font-medium text-ink">
                    {selectedResource.name}&apos;s current allocation
                  </span>
                  <span className="tnum text-xs text-ink2">
                    {headroom}% available
                  </span>
                </div>
                <AllocationBar
                  billable={selectedResource.billable}
                  shadow={selectedResource.shadow}
                />
              </div>
            )}
          </FormSection>

          <FormSection title="Type & Allocation">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Deployment Type" required>
                <div className="flex rounded-md border border-line bg-surface p-0.5">
                  {(['billable', 'shadow'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, deploymentType: t })}
                      className={`flex-1 rounded px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                        form.deploymentType === t
                          ? 'bg-brand text-white'
                          : 'text-ink2 hover:text-ink'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </Field>

              <Field
                label={`Allocation — ${form.allocationPercentage}%`}
                required
                error={errors.allocationPercentage}
                hint={
                  selectedResource
                    ? `${headroom}% available for this resource`
                    : 'Select a resource to see available headroom'
                }
              >
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={5}
                  value={form.allocationPercentage}
                  onChange={(e) =>
                    setForm({ ...form, allocationPercentage: e.target.value })
                  }
                  className="w-full accent-[rgb(var(--accent))]"
                />
              </Field>
            </div>

            {overAllocated && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {selectedResource?.name} has only {headroom}% available. Reduce the
                  allocation or end an existing deployment first.
                </span>
              </div>
            )}
          </FormSection>

          <FormSection title="Period">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start Date" required error={errors.startDate}>
                <input
                  className="input"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                />
              </Field>
              <Field
                label="End Date"
                error={errors.endDate}
                hint="Leave blank for an open-ended deployment"
              >
                <input
                  className="input"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          {!isShadow && (
            <FormSection title="Billing">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Billing Amount (₹/month)"
                  required
                  error={errors.billingAmount}
                >
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={form.billingAmount}
                    onChange={(e) => setForm({ ...form, billingAmount: e.target.value })}
                  />
                </Field>
                <Field
                  label="Commission (₹/month)"
                  error={errors.commissionAmount}
                  hint="Cannot exceed the billing amount"
                >
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={form.commissionAmount}
                    onChange={(e) =>
                      setForm({ ...form, commissionAmount: e.target.value })
                    }
                  />
                </Field>
              </div>

              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-ink2">
                <input
                  type="checkbox"
                  checked={form.gstApplicable}
                  onChange={(e) =>
                    setForm({ ...form, gstApplicable: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-line accent-[rgb(var(--accent))]"
                />
                GST applicable (18%)
              </label>

              {billingPreview.base > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-line bg-surface2 p-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-2xs text-ink3">Base</dt>
                    <dd className="tnum font-medium text-ink">
                      {formatINR(billingPreview.base)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-ink3">GST</dt>
                    <dd className="tnum font-medium text-ink">
                      {formatINR(billingPreview.gst)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-ink3">Total</dt>
                    <dd className="tnum font-medium text-ink">
                      {formatINR(billingPreview.total)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-2xs text-ink3">Margin</dt>
                    <dd className="tnum font-medium text-emerald-600 dark:text-emerald-400">
                      {formatINR(billingPreview.margin)}
                    </dd>
                  </div>
                </dl>
              )}
            </FormSection>
          )}

          {isShadow && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              Shadow deployments are non-billable. They still consume allocation
              capacity, so this resource cannot exceed 100% across all active
              deployments.
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={save}
            disabled={saving || overAllocated}
          >
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Deployment'}
          </button>
        </div>
      </Modal>

      {/* End deployment */}
      <Modal
        open={Boolean(endingRow)}
        onClose={() => setEndingRow(null)}
        title="End Deployment"
        description={
          endingRow
            ? `${endingRow.resourceName} on ${endingRow.projectName}`
            : undefined
        }
      >
        {endError && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {endError}
          </div>
        )}
        <p className="mb-4 text-sm text-ink2">
          Ending this deployment frees its {endingRow?.allocationPercentage}% allocation
          back to {endingRow?.resourceName}.
        </p>
        <Field label="End Date" required>
          <input
            className="input"
            type="date"
            value={endDate}
            min={endingRow?.startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setEndingRow(null)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={endDeployment}>
            End Deployment
          </button>
        </div>
      </Modal>
    </div>
  );
}
