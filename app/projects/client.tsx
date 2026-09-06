'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, FolderKanban } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatINRCompact } from '@/lib/utils';
import {
  PageHeader,
  Modal,
  Field,
  EmptyState,
  TableShell,
  FormSection,
  Badge,
} from '@/components/ui';

type Row = {
  id: number;
  clientId: number;
  projectName: string;
  managerName: string | null;
  managerEmail: string | null;
  managerMobile: string | null;
  managerDesignation: string | null;
  clientName: string;
  headcount: number;
  monthlyBilling: number;
};

type ClientOption = { id: number; companyName: string };

const BLANK = {
  clientId: '',
  projectName: '',
  managerName: '',
  managerEmail: '',
  managerMobile: '',
  managerDesignation: '',
};

export default function ProjectsClient({
  initial,
  clients,
}: {
  initial: Row[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((p) => {
      if (clientFilter && p.clientId !== Number(clientFilter)) return false;
      if (!q) return true;
      return (
        p.projectName.toLowerCase().includes(q) ||
        p.clientName.toLowerCase().includes(q) ||
        (p.managerName ?? '').toLowerCase().includes(q)
      );
    });
  }, [initial, search, clientFilter]);

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  function openEdit(p: Row) {
    setEditing(p);
    setForm({
      clientId: String(p.clientId),
      projectName: p.projectName,
      managerName: p.managerName ?? '',
      managerEmail: p.managerEmail ?? '',
      managerMobile: p.managerMobile ?? '',
      managerDesignation: p.managerDesignation ?? '',
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
      if (editing) {
        await api(`/api/projects/${editing.id}`, { method: 'PUT', json: form });
      } else {
        await api('/api/projects', { method: 'POST', json: form });
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

  async function remove(p: Row) {
    if (!confirm(`Delete ${p.projectName}?`)) return;
    try {
      await api(`/api/projects/${p.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Projects"
        subtitle={`${initial.length} engagements across ${clients.length} clients`}
        action={
          <button className="btn-primary" onClick={openCreate} disabled={!clients.length}>
            <Plus className="h-4 w-4" /> Add Project
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search project, client, manager…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input max-w-56"
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          aria-label="Filter by client"
        >
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName}
            </option>
          ))}
        </select>
      </div>

      <div className="px-6">
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title={initial.length ? 'No matching projects' : 'No projects yet'}
              description={
                clients.length
                  ? initial.length
                    ? 'Try a different search or clear the client filter.'
                    : 'Create a project to start deploying resources against it.'
                  : 'Add a client first — every project belongs to one.'
              }
              action={
                !initial.length &&
                clients.length > 0 && (
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add Project
                  </button>
                )
              }
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Project</th>
                  <th className="th">Client</th>
                  <th className="th">Project Manager</th>
                  <th className="th text-right">Deployed</th>
                  <th className="th text-right">Monthly Billing</th>
                  <th className="th w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <div className="font-medium text-ink">{p.projectName}</div>
                    </td>
                    <td className="td">{p.clientName}</td>
                    <td className="td">
                      {p.managerName ? (
                        <>
                          <div className="text-ink">{p.managerName}</div>
                          <div className="text-2xs text-ink3">
                            {p.managerDesignation ?? '—'}
                            {p.managerEmail ? ` · ${p.managerEmail}` : ''}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td text-right">
                      {p.headcount > 0 ? (
                        <Badge tone="blue">{p.headcount}</Badge>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <span className="tnum font-medium text-ink">
                        {p.monthlyBilling > 0 ? formatINRCompact(p.monthlyBilling) : '—'}
                      </span>
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(p)}
                          className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                          aria-label={`Edit ${p.projectName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(p)}
                          className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          aria-label={`Delete ${p.projectName}`}
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
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.projectName}` : 'Add Project'}
        description="Engagement details and the client-side project manager"
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <div className="space-y-5">
          <FormSection title="Project">
            <div className="grid gap-3">
              <Field label="Client" required error={errors.clientId}>
                <select
                  className="input"
                  value={form.clientId}
                  onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                >
                  <option value="">Select a client…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Project Name" required error={errors.projectName}>
                <input
                  className="input"
                  value={form.projectName}
                  onChange={(e) => setForm({ ...form, projectName: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Project Manager">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" error={errors.managerName}>
                <input
                  className="input"
                  value={form.managerName}
                  onChange={(e) => setForm({ ...form, managerName: e.target.value })}
                />
              </Field>
              <Field label="Designation" error={errors.managerDesignation}>
                <input
                  className="input"
                  value={form.managerDesignation}
                  onChange={(e) =>
                    setForm({ ...form, managerDesignation: e.target.value })
                  }
                />
              </Field>
              <Field label="Email" error={errors.managerEmail}>
                <input
                  className="input"
                  type="email"
                  value={form.managerEmail}
                  onChange={(e) => setForm({ ...form, managerEmail: e.target.value })}
                />
              </Field>
              <Field label="Mobile" error={errors.managerMobile}>
                <input
                  className="input"
                  value={form.managerMobile}
                  onChange={(e) => setForm({ ...form, managerMobile: e.target.value })}
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
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Project'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
