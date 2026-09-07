'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, Search, Building2, Mail, Phone } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatMoneyMulti, LIST_PAGE_SIZE, type MoneyByCurrency } from '@/lib/utils';
import {
  PageHeader,
  Modal,
  Field,
  EmptyState,
  TableShell,
  FormSection,
  Badge,
  Pagination,
} from '@/components/ui';

type Row = {
  id: number;
  companyName: string;
  spocName: string | null;
  spocEmail: string | null;
  spocMobile: string | null;
  spocDesignation: string | null;
  accountName: string | null;
  accountEmail: string | null;
  accountMobile: string | null;
  altSpocName: string | null;
  altSpocEmail: string | null;
  altSpocMobile: string | null;
  altSpocDesignation: string | null;
  projectCount: number;
  monthlyBilling: MoneyByCurrency;
};

const BLANK = {
  companyName: '',
  spocName: '',
  spocEmail: '',
  spocMobile: '',
  spocDesignation: '',
  accountName: '',
  accountEmail: '',
  accountMobile: '',
  altSpocName: '',
  altSpocEmail: '',
  altSpocMobile: '',
  altSpocDesignation: '',
};

type Tab = 'spoc' | 'account' | 'alt';

export default function ClientsClient({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [hasProjects, setHasProjects] = useState<'all' | 'with' | 'without'>('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);
  const [tab, setTab] = useState<Tab>('spoc');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((c) => {
      if (hasProjects === 'with' && c.projectCount === 0) return false;
      if (hasProjects === 'without' && c.projectCount > 0) return false;
      if (!q) return true;
      return (
        c.companyName.toLowerCase().includes(q) ||
        (c.spocName ?? '').toLowerCase().includes(q)
      );
    });
  }, [initial, search, hasProjects]);

  useEffect(() => setPage(1), [search, hasProjects]);

  const pageItems = useMemo(
    () => filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [filtered, page],
  );

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setTab('spoc');
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  function openEdit(c: Row) {
    setEditing(c);
    setForm({
      companyName: c.companyName,
      spocName: c.spocName ?? '',
      spocEmail: c.spocEmail ?? '',
      spocMobile: c.spocMobile ?? '',
      spocDesignation: c.spocDesignation ?? '',
      accountName: c.accountName ?? '',
      accountEmail: c.accountEmail ?? '',
      accountMobile: c.accountMobile ?? '',
      altSpocName: c.altSpocName ?? '',
      altSpocEmail: c.altSpocEmail ?? '',
      altSpocMobile: c.altSpocMobile ?? '',
      altSpocDesignation: c.altSpocDesignation ?? '',
    });
    setTab('spoc');
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
        await api(`/api/clients/${editing.id}`, { method: 'PUT', json: form });
      } else {
        await api('/api/clients', { method: 'POST', json: form });
      }
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) {
        setErrors(e.fields);
        // Surface the tab holding the first invalid field.
        const k = Object.keys(e.fields)[0] ?? '';
        if (k.startsWith('account')) setTab('account');
        else if (k.startsWith('altSpoc')) setTab('alt');
        else setTab('spoc');
      }
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Row) {
    if (!confirm(`Delete ${c.companyName}?`)) return;
    try {
      await api(`/api/clients/${c.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'spoc', label: 'Primary SPOC' },
    { id: 'account', label: 'Account Manager' },
    { id: 'alt', label: 'Alternate SPOC' },
  ];

  return (
    <div className="pb-12">
      <PageHeader
        title="Clients"
        subtitle={`${initial.length} client companies`}
        action={
          <button className="btn-primary" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Client
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2 px-6 py-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search company or SPOC…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex rounded-md border border-line bg-surface p-0.5">
          {(['all', 'with', 'without'] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHasProjects(h)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                hasProjects === h ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'
              }`}
            >
              {h === 'all' ? 'All' : h === 'with' ? 'Has Projects' : 'No Projects'}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6">
        <div className="card overflow-hidden">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Building2}
              title={initial.length ? 'No matching clients' : 'No clients yet'}
              description={
                initial.length
                  ? 'Try a different search term or filter.'
                  : 'Add a client to start creating projects and agreements.'
              }
              action={
                !initial.length && (
                  <button className="btn-primary" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add Client
                  </button>
                )
              }
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Company</th>
                  <th className="th">Primary SPOC</th>
                  <th className="th">Account Manager</th>
                  <th className="th text-right">Projects</th>
                  <th className="th text-right">Monthly Billing</th>
                  <th className="th w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((c) => (
                  <tr key={c.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <div className="font-medium text-ink">{c.companyName}</div>
                      {c.altSpocName && (
                        <div className="text-2xs text-ink3">
                          Alt: {c.altSpocName}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      {c.spocName ? (
                        <>
                          <div className="text-ink">{c.spocName}</div>
                          <div className="flex flex-col gap-0.5 text-2xs text-ink3">
                            {c.spocDesignation && <span>{c.spocDesignation}</span>}
                            {c.spocEmail && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" /> {c.spocEmail}
                              </span>
                            )}
                            {c.spocMobile && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {c.spocMobile}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td">
                      {c.accountName ? (
                        <>
                          <div className="text-ink">{c.accountName}</div>
                          <div className="text-2xs text-ink3">{c.accountEmail}</div>
                        </>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td text-right">
                      {c.projectCount > 0 ? (
                        <Badge tone="blue">{c.projectCount}</Badge>
                      ) : (
                        <span className="text-ink3">—</span>
                      )}
                    </td>
                    <td className="td text-right">
                      <span className="tnum font-medium text-ink">
                        {formatMoneyMulti(c.monthlyBilling)}
                      </span>
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                          aria-label={`Edit ${c.companyName}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(c)}
                          className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          aria-label={`Delete ${c.companyName}`}
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
        title={editing ? `Edit ${editing.companyName}` : 'Add Client'}
        description="Company details and the three contact roles"
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <Field label="Company Name" required error={errors.companyName}>
          <input
            className="input"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </Field>

        <div className="mt-5 flex gap-1 border-b border-line">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-brand text-brand'
                  : 'border-transparent text-ink2 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {tab === 'spoc' && (
            <FormSection title="Primary SPOC">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" error={errors.spocName}>
                  <input
                    className="input"
                    value={form.spocName}
                    onChange={(e) => setForm({ ...form, spocName: e.target.value })}
                  />
                </Field>
                <Field label="Designation" error={errors.spocDesignation}>
                  <input
                    className="input"
                    value={form.spocDesignation}
                    onChange={(e) =>
                      setForm({ ...form, spocDesignation: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email" error={errors.spocEmail}>
                  <input
                    className="input"
                    type="email"
                    value={form.spocEmail}
                    onChange={(e) => setForm({ ...form, spocEmail: e.target.value })}
                  />
                </Field>
                <Field label="Mobile" error={errors.spocMobile}>
                  <input
                    className="input"
                    value={form.spocMobile}
                    onChange={(e) => setForm({ ...form, spocMobile: e.target.value })}
                  />
                </Field>
              </div>
            </FormSection>
          )}

          {tab === 'account' && (
            <FormSection title="Account Manager">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" error={errors.accountName}>
                  <input
                    className="input"
                    value={form.accountName}
                    onChange={(e) => setForm({ ...form, accountName: e.target.value })}
                  />
                </Field>
                <Field label="Email" error={errors.accountEmail}>
                  <input
                    className="input"
                    type="email"
                    value={form.accountEmail}
                    onChange={(e) => setForm({ ...form, accountEmail: e.target.value })}
                  />
                </Field>
                <Field label="Mobile" error={errors.accountMobile}>
                  <input
                    className="input"
                    value={form.accountMobile}
                    onChange={(e) => setForm({ ...form, accountMobile: e.target.value })}
                  />
                </Field>
              </div>
            </FormSection>
          )}

          {tab === 'alt' && (
            <FormSection title="Alternate SPOC">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" error={errors.altSpocName}>
                  <input
                    className="input"
                    value={form.altSpocName}
                    onChange={(e) => setForm({ ...form, altSpocName: e.target.value })}
                  />
                </Field>
                <Field label="Designation" error={errors.altSpocDesignation}>
                  <input
                    className="input"
                    value={form.altSpocDesignation}
                    onChange={(e) =>
                      setForm({ ...form, altSpocDesignation: e.target.value })
                    }
                  />
                </Field>
                <Field label="Email" error={errors.altSpocEmail}>
                  <input
                    className="input"
                    type="email"
                    value={form.altSpocEmail}
                    onChange={(e) => setForm({ ...form, altSpocEmail: e.target.value })}
                  />
                </Field>
                <Field label="Mobile" error={errors.altSpocMobile}>
                  <input
                    className="input"
                    value={form.altSpocMobile}
                    onChange={(e) => setForm({ ...form, altSpocMobile: e.target.value })}
                  />
                </Field>
              </div>
            </FormSection>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
