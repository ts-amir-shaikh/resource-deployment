'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ReceiptIndianRupee,
  ChevronRight,
  AlertTriangle,
  LayoutGrid,
  List,
} from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import {
  formatMoney,
  formatMoneyMulti,
  CURRENCY_OPTIONS,
  gstApplies,
  sumByCurrency,
  type MoneyByCurrency,
  formatDate,
  today,
  GST_RATE,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_ORDER,
  nextInvoiceStatus,
  LIST_PAGE_SIZE,
} from '@/lib/utils';
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

type Status = 'not_raised' | 'raised' | 'pending_collection' | 'collected';

type Row = {
  id: number;
  projectId: number;
  agreementId: number | null;
  invoiceNumber: string | null;
  scope: 'individual' | 'team';
  periodFrom: string;
  periodTo: string;
  currency: string;
  fxRateToInr: number;
  amount: number;
  gstAmount: number;
  invoiceDate: string | null;
  dueDate: string | null;
  collectedDate: string | null;
  status: Status;
  notes: string | null;
  projectName: string;
  clientName: string;
  agreementTitle: string | null;
  agreementNumber: string | null;
  totalAmount: number;
  overdue: boolean;
};

type ProjectOption = { id: number; projectName: string; clientName: string };
type AgreementOption = {
  id: number;
  projectId: number;
  title: string;
  agreementNumber: string | null;
  renewalVersion: number;
};
type ResourceOption = { id: number; name: string };

/** One row of an agreement's registered rate card, from /api/agreements/[id]. */
type AgreementResource = { resourceId: number; resourceName: string; billingAmount: number };

const STATUS_TONE: Record<Status, Tone> = {
  not_raised: 'neutral',
  raised: 'amber',
  pending_collection: 'rose',
  collected: 'green',
};

const BLANK = {
  projectId: '',
  agreementId: '',
  invoiceNumber: '',
  scope: 'team' as 'individual' | 'team',
  periodFrom: '',
  periodTo: '',
  currency: 'INR',
  fxRateToInr: '1',
  amount: '',
  gstAmount: '',
  invoiceDate: '',
  dueDate: '',
  notes: '',
  resourceIds: [] as number[],
};

export default function InvoicesClient({
  initial,
  projects,
  agreements,
  resources,
}: {
  initial: Row[];
  projects: ProjectOption[];
  agreements: AgreementOption[];
  resources: ResourceOption[];
}) {
  const router = useRouter();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Status>('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [clientFilter, setClientFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  // The selected agreement's registered rate card (resource + billing rate),
  // so the invoice can be raised for a subset of it without retyping prices.
  const [agreementResources, setAgreementResources] = useState<AgreementResource[]>([]);
  const [loadingRateCard, setLoadingRateCard] = useState(false);

  const clientOptions = useMemo(() => {
    const set = new Set(initial.map((i) => i.clientName));
    return [...set].sort();
  }, [initial]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter((i) => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (onlyOverdue && !i.overdue) return false;
      if (clientFilter && i.clientName !== clientFilter) return false;
      if (!q) return true;
      return (
        (i.invoiceNumber ?? '').toLowerCase().includes(q) ||
        i.clientName.toLowerCase().includes(q) ||
        i.projectName.toLowerCase().includes(q)
      );
    });
  }, [initial, search, statusFilter, onlyOverdue, clientFilter]);

  useEffect(
    () => setPage(1),
    [search, statusFilter, onlyOverdue, clientFilter],
  );

  // Only the list view is paginated — the board view is columns, not rows.
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE),
    [filtered, page],
  );

  // Per status AND per currency — adding a dirham invoice to a rupee one would
  // produce a status tile showing a number that is true of neither.
  const totals = useMemo(() => {
    const by: Record<string, { count: number; rows: { currency: string; amount: number }[] }> =
      {};
    for (const st of INVOICE_STATUS_ORDER) by[st] = { count: 0, rows: [] };
    for (const i of initial) {
      by[i.status].count += 1;
      by[i.status].rows.push({ currency: i.currency, amount: i.totalAmount });
    }
    return Object.fromEntries(
      Object.entries(by).map(([st, v]) => [
        st,
        { count: v.count, total: sumByCurrency(v.rows) },
      ]),
    ) as Record<string, { count: number; total: MoneyByCurrency }>;
  }, [initial]);

  const invoiceSymbol =
    CURRENCY_OPTIONS.find((c) => c.value === form.currency)?.symbol ?? '₹';

  const overdueCount = initial.filter((i) => i.overdue).length;

  // Only invoices that can actually move are eligible for bulk actions.
  const selectableIds = filtered.filter((i) => i.status !== 'collected').map((i) => i.id);
  const selectedRows = initial.filter((i) => selected.has(i.id));
  const bulkTarget = useMemo(() => {
    if (!selectedRows.length) return null;
    const nexts = new Set(selectedRows.map((r) => nextInvoiceStatus(r.status)));
    return nexts.size === 1 ? [...nexts][0] : null;
  }, [selectedRows]);

  const agreementsForProject = agreements.filter(
    (a) => a.projectId === Number(form.projectId),
  );

  // Load the chosen agreement's registered resources + rates. Cleared when
  // no agreement is selected, in which case the resource picker and amount
  // fall back to the original fully-manual behaviour.
  useEffect(() => {
    if (!form.agreementId) {
      setAgreementResources([]);
      return;
    }
    let cancelled = false;
    setLoadingRateCard(true);
    api<{
      currency: string;
      resources: { resourceId: number; resourceName: string; billingAmount: number }[];
    }>(`/api/agreements/${form.agreementId}`)
      .then((detail) => {
        if (cancelled) return;
        setAgreementResources(detail.resources);
        // An invoice is raised against a PO, so it is denominated in the PO's
        // currency — the API rejects a mismatch regardless.
        setForm((f) => ({
          ...f,
          currency: detail.currency,
          gstAmount: gstApplies(detail.currency) ? f.gstAmount : '',
          fxRateToInr: detail.currency === 'INR' ? '1' : f.fxRateToInr,
        }));
      })
      .catch(() => {
        if (!cancelled) setAgreementResources([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRateCard(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.agreementId]);

  // With an agreement selected, the amount is the sum of whichever of its
  // registered resources are checked — not typed by hand. Recomputes live as
  // the selection changes; still a plain field the user can override after.
  useEffect(() => {
    if (!agreementResources.length) return;
    const sum = form.resourceIds.reduce((total, id) => {
      const rate = agreementResources.find((r) => r.resourceId === id);
      return total + (rate?.billingAmount ?? 0);
    }, 0);
    setForm((f) => (f.amount === String(sum) ? f : { ...f, amount: String(sum) }));
    // Only resourceIds/agreementResources should retrigger this — form.amount
    // itself is written by this effect, so it must stay out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.resourceIds, agreementResources]);

  function openCreate() {
    setEditing(null);
    setForm(BLANK);
    setErrors({});
    setBanner(null);
    setOpen(true);
  }

  async function openEdit(i: Row) {
    setEditing(i);
    setForm({
      projectId: String(i.projectId),
      agreementId: i.agreementId ? String(i.agreementId) : '',
      invoiceNumber: i.invoiceNumber ?? '',
      scope: i.scope,
      periodFrom: i.periodFrom,
      periodTo: i.periodTo,
      currency: i.currency ?? 'INR',
      fxRateToInr: String(i.fxRateToInr ?? 1),
      amount: String(i.amount),
      gstAmount: String(i.gstAmount),
      invoiceDate: i.invoiceDate ?? '',
      dueDate: i.dueDate ?? '',
      notes: i.notes ?? '',
      // The list row doesn't carry which resources are tagged — fetched below.
      resourceIds: [],
    });
    setErrors({});
    setBanner(null);
    setOpen(true);

    // Load the resources actually saved on this invoice, so re-saving
    // without touching the picker doesn't silently clear them.
    try {
      const detail = await api<{ resources: { resourceId: number }[] }>(
        `/api/invoices/${i.id}`,
      );
      setForm((f) => ({ ...f, resourceIds: detail.resources.map((r) => r.resourceId) }));
    } catch {
      // Leave resourceIds empty; the user can re-pick if this fails.
    }
  }

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount) || 0,
        gstAmount: Number(form.gstAmount) || 0,
        fxRateToInr: Number(form.fxRateToInr) || 1,
      };
      if (editing) {
        await api(`/api/invoices/${editing.id}`, { method: 'PUT', json: payload });
      } else {
        await api('/api/invoices', { method: 'POST', json: payload });
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

  async function advance(i: Row) {
    setBusy(true);
    try {
      await api(`/api/invoices/${i.id}/advance`, { method: 'POST', json: {} });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function bulkAdvance() {
    if (!bulkTarget || !selected.size) return;
    setBusy(true);
    try {
      const res = await api<{ advanced: number[]; skipped: { reason: string }[] }>(
        '/api/invoices/bulk-advance',
        {
          method: 'POST',
          json: { ids: [...selected], targetStatus: bulkTarget },
        },
      );
      setSelected(new Set());
      router.refresh();
      if (res.skipped.length) {
        alert(
          `${res.advanced.length} moved. ${res.skipped.length} skipped (already at or past that stage).`,
        );
      }
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(i: Row) {
    if (!confirm(`Delete invoice ${i.invoiceNumber ?? `#${i.id}`}?`)) return;
    try {
      await api(`/api/invoices/${i.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  const gstSuggestion = Number(form.amount) ? Number(form.amount) * GST_RATE : 0;

  return (
    <div className="pb-12">
      <PageHeader
        title="Invoices"
        subtitle="Billing periods and collection status"
        action={
          <button className="btn-primary" onClick={openCreate} disabled={!projects.length}>
            <Plus className="h-4 w-4" /> Add Invoice
          </button>
        }
      />

      {/* Pipeline summary — doubles as the status filter */}
      <div className="grid grid-cols-2 gap-3 px-6 py-4 lg:grid-cols-4">
        {INVOICE_STATUS_ORDER.map((st) => {
          const active = statusFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(active ? 'all' : st)}
              className={`card p-3 text-left transition-colors ${
                active ? 'ring-2 ring-brand' : 'hover:bg-surface2/50'
              }`}
            >
              <Badge tone={STATUS_TONE[st]}>{INVOICE_STATUS_LABELS[st]}</Badge>
              <div className="tnum mt-1.5 text-xl font-semibold text-ink">
                {totals[st].count}
              </div>
              <div className="tnum text-xs text-ink2">
                {formatMoneyMulti(totals[st].total)}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink3" />
          <input
            className="input pl-8"
            placeholder="Search invoice no., client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {overdueCount > 0 && (
          <button
            onClick={() => setOnlyOverdue(!onlyOverdue)}
            className={`chip border transition-colors ${
              onlyOverdue
                ? 'border-rose-400 bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200'
                : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300'
            }`}
          >
            <AlertTriangle className="h-3 w-3" /> {overdueCount} overdue
          </button>
        )}

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

        <div className="ml-auto flex rounded-md border border-line bg-surface p-0.5">
          <button
            onClick={() => setView('list')}
            className={`rounded px-2.5 py-1.5 ${view === 'list' ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'}`}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('board')}
            className={`rounded px-2.5 py-1.5 ${view === 'board' ? 'bg-brand text-white' : 'text-ink2 hover:text-ink'}`}
            aria-label="Board view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mx-6 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand bg-brandbg px-4 py-2.5">
          <span className="text-sm font-medium text-ink">
            {selected.size} selected
          </span>
          {bulkTarget ? (
            <button className="btn-primary" onClick={bulkAdvance} disabled={busy}>
              Move to {INVOICE_STATUS_LABELS[bulkTarget]}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="text-xs text-ink2">
              Selected invoices are at different stages — select one stage at a time to
              advance them together.
            </span>
          )}
          <button
            className="ml-auto text-xs font-medium text-ink2 hover:text-ink"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      <div className="px-6">
        {filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={ReceiptIndianRupee}
              title={initial.length ? 'No matching invoices' : 'No invoices yet'}
              description={
                projects.length
                  ? initial.length
                    ? 'Try a different filter or search term.'
                    : 'Raise your first invoice against a project billing period.'
                  : 'Add a project first — invoices bind to one.'
              }
            />
          </div>
        ) : view === 'board' ? (
          /* ── Kanban board ── */
          <div className="grid gap-3 lg:grid-cols-4">
            {INVOICE_STATUS_ORDER.map((st) => {
              const items = filtered.filter((i) => i.status === st);
              return (
                <section key={st} className="card flex flex-col">
                  <header className="flex items-center justify-between border-b border-line px-3 py-2.5">
                    <Badge tone={STATUS_TONE[st]}>{INVOICE_STATUS_LABELS[st]}</Badge>
                    <span className="tnum text-xs text-ink3">{items.length}</span>
                  </header>
                  <ul className="flex-1 space-y-2 p-2">
                    {items.map((i) => (
                      <li
                        key={i.id}
                        className={`rounded-md border p-2.5 ${
                          i.overdue
                            ? 'border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/40'
                            : 'border-line bg-surface2/50'
                        }`}
                      >
                        <div className="font-mono text-2xs text-ink3">
                          {i.invoiceNumber ?? `#${i.id}`}
                        </div>
                        <div className="mt-0.5 truncate text-sm font-medium text-ink">
                          {i.clientName}
                        </div>
                        <div className="truncate text-2xs text-ink3">{i.projectName}</div>
                        <div className="tnum mt-1.5 text-sm font-semibold text-ink">
                          {formatMoney(i.totalAmount, i.currency)}
                        </div>
                        <div className="tnum text-2xs text-ink3">
                          {formatDate(i.periodFrom)} → {formatDate(i.periodTo)}
                        </div>
                        {i.overdue && (
                          <div className="mt-1 flex items-center gap-1 text-2xs font-medium text-rose-700 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" /> Due{' '}
                            {formatDate(i.dueDate)}
                          </div>
                        )}
                        {st !== 'collected' && (
                          <button
                            onClick={() => advance(i)}
                            disabled={busy}
                            className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-line bg-surface py-1 text-2xs font-medium text-ink2 hover:bg-surface2 hover:text-ink"
                          >
                            Move to{' '}
                            {INVOICE_STATUS_LABELS[nextInvoiceStatus(i.status)!]}
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
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
        ) : (
          /* ── List view ── */
          <div className="card overflow-hidden">
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      className="h-3.5 w-3.5 rounded border-line accent-[rgb(var(--accent))]"
                      checked={
                        selectableIds.length > 0 &&
                        selectableIds.every((id) => selected.has(id))
                      }
                      onChange={(e) =>
                        setSelected(new Set(e.target.checked ? selectableIds : []))
                      }
                    />
                  </th>
                  <th className="th">Invoice</th>
                  <th className="th">Client / Project</th>
                  <th className="th">Period</th>
                  <th className="th text-right">Amount</th>
                  <th className="th">Status</th>
                  <th className="th w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pageItems.map((i) => (
                  <tr
                    key={i.id}
                    className={
                      i.overdue
                        ? 'bg-rose-50/60 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-950/40'
                        : 'hover:bg-surface2/50'
                    }
                  >
                    <td className="td">
                      <input
                        type="checkbox"
                        aria-label={`Select invoice ${i.invoiceNumber ?? i.id}`}
                        className="h-3.5 w-3.5 rounded border-line accent-[rgb(var(--accent))]"
                        disabled={i.status === 'collected'}
                        checked={selected.has(i.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(i.id);
                          else next.delete(i.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="td">
                      <Link
                        href={`/invoices/${i.id}`}
                        className="block font-mono text-xs text-ink hover:text-brand"
                      >
                        {i.invoiceNumber ?? `#${i.id}`}
                      </Link>
                      <div className="text-2xs text-ink3">
                        {i.agreementNumber ?? (i.agreementId ? i.agreementTitle : 'No PO')}
                      </div>
                    </td>
                    <td className="td">
                      <div className="text-ink">{i.clientName}</div>
                      <div className="text-2xs text-ink3">{i.projectName}</div>
                    </td>
                    <td className="td">
                      <div className="tnum text-ink">{formatDate(i.periodFrom)}</div>
                      <div className="tnum text-2xs text-ink3">
                        → {formatDate(i.periodTo)}
                      </div>
                    </td>
                    <td className="td text-right">
                      <div className="tnum font-medium text-ink">
                        {formatMoney(i.totalAmount, i.currency)}
                      </div>
                      <div className="tnum text-2xs text-ink3">
                        {formatMoney(i.amount, i.currency)} + {formatMoney(i.gstAmount, i.currency)} GST
                      </div>
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[i.status]}>
                        {INVOICE_STATUS_LABELS[i.status]}
                      </Badge>
                      {i.overdue && (
                        <div className="mt-0.5 flex items-center gap-1 text-2xs font-medium text-rose-700 dark:text-rose-400">
                          <AlertTriangle className="h-3 w-3" /> Due{' '}
                          {formatDate(i.dueDate)}
                        </div>
                      )}
                      {i.status === 'collected' && i.collectedDate && (
                        <div className="mt-0.5 text-2xs text-ink3">
                          on {formatDate(i.collectedDate)}
                        </div>
                      )}
                    </td>
                    <td className="td text-right">
                      <div className="flex justify-end gap-1">
                        {i.status !== 'collected' && (
                          <button
                            onClick={() => advance(i)}
                            disabled={busy}
                            className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink"
                            title={`Move to ${INVOICE_STATUS_LABELS[nextInvoiceStatus(i.status)!]}`}
                            aria-label={`Advance invoice ${i.invoiceNumber ?? i.id}`}
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openEdit(i)}
                          disabled={i.status === 'collected'}
                          className="rounded p-1.5 text-ink3 hover:bg-surface2 hover:text-ink disabled:opacity-30"
                          aria-label={`Edit invoice ${i.invoiceNumber ?? i.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(i)}
                          disabled={i.status === 'collected'}
                          className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 dark:hover:bg-rose-950"
                          aria-label={`Delete invoice ${i.invoiceNumber ?? i.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            {filtered.length > 0 && (
              <Pagination
                page={page}
                pageSize={LIST_PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPage}
              />
            )}
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.invoiceNumber ?? 'Invoice'}` : 'Add Invoice'}
        description="New invoices start at Not Raised and move forward only"
        wide
      >
        {banner && (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {banner}
          </div>
        )}

        <div className="space-y-5">
          <FormSection title="Billed To">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project" required error={errors.projectId}>
                <select
                  className="input"
                  value={form.projectId}
                  onChange={(e) =>
                    setForm({ ...form, projectId: e.target.value, agreementId: '' })
                  }
                >
                  <option value="">Select a project…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.clientName} — {p.projectName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Agreement / PO"
                error={errors.agreementId}
                hint={
                  form.projectId && !agreementsForProject.length
                    ? 'No agreements on this project — invoice can still be raised'
                    : 'Optional'
                }
              >
                <select
                  className="input"
                  value={form.agreementId}
                  onChange={(e) =>
                    setForm({ ...form, agreementId: e.target.value, resourceIds: [] })
                  }
                  disabled={!form.projectId}
                >
                  <option value="">No PO</option>
                  {agreementsForProject.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.agreementNumber ?? a.title}
                      {a.renewalVersion > 1 ? ` (v${a.renewalVersion})` : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoice Number" error={errors.invoiceNumber}>
                <input
                  className="input font-mono"
                  placeholder="e.g. TS/INV/2025-0341"
                  value={form.invoiceNumber}
                  onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                />
              </Field>
              <Field label="Scope" required>
                <div className="flex rounded-md border border-line bg-surface p-0.5">
                  {(['individual', 'team'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm({ ...form, scope: s })}
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
            </div>
          </FormSection>

          <FormSection title="Billing Period">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Period From" required error={errors.periodFrom}>
                <input
                  className="input"
                  type="date"
                  value={form.periodFrom}
                  onChange={(e) => setForm({ ...form, periodFrom: e.target.value })}
                />
              </Field>
              <Field label="Period To" required error={errors.periodTo}>
                <input
                  className="input"
                  type="date"
                  value={form.periodTo}
                  onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Amounts">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Currency"
                required
                error={errors.currency}
                hint={
                  form.agreementId
                    ? 'Set by the agreement this invoice is raised against'
                    : undefined
                }
              >
                <select
                  className="input"
                  value={form.currency}
                  disabled={Boolean(form.agreementId)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      currency: e.target.value,
                      gstAmount: gstApplies(e.target.value) ? form.gstAmount : '',
                      fxRateToInr: e.target.value === 'INR' ? '1' : form.fxRateToInr,
                    })
                  }
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>

              {!gstApplies(form.currency) && (
                <Field
                  label={`Exchange rate — 1 ${form.currency} in ₹`}
                  required
                  error={errors.fxRateToInr}
                  hint="Locked at the rate on the day this invoice is raised, for later reporting"
                >
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.0001"
                    value={form.fxRateToInr}
                    onChange={(e) =>
                      setForm({ ...form, fxRateToInr: e.target.value })
                    }
                  />
                </Field>
              )}

              <Field
                label={`Amount (pre-GST) ${invoiceSymbol}`}
                required
                error={errors.amount}
                hint={
                  agreementResources.length
                    ? 'Sum of the selected resources’ rates below — still editable'
                    : undefined
                }
              >
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </Field>
              <Field
                label="GST Amount ₹"
                className={gstApplies(form.currency) ? undefined : 'hidden'}
                error={errors.gstAmount}
                hint={
                  gstSuggestion > 0
                    ? `18% would be ${formatMoney(gstSuggestion, form.currency)}`
                    : undefined
                }
              >
                <div className="flex gap-2">
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={form.gstAmount}
                    onChange={(e) => setForm({ ...form, gstAmount: e.target.value })}
                  />
                  {gstSuggestion > 0 && (
                    <button
                      type="button"
                      className="btn-ghost shrink-0"
                      onClick={() =>
                        setForm({ ...form, gstAmount: gstSuggestion.toFixed(0) })
                      }
                    >
                      Apply 18%
                    </button>
                  )}
                </div>
              </Field>
            </div>

            {Number(form.amount) > 0 && (
              <div className="tnum mt-3 flex items-baseline justify-between rounded-md border border-line bg-surface2 px-3 py-2">
                <span className="text-xs text-ink2">Invoice total</span>
                <span className="text-lg font-semibold text-ink">
                  {formatMoney(Number(form.amount) + (Number(form.gstAmount) || 0), form.currency)}
                </span>
              </div>
            )}
          </FormSection>

          <FormSection title="Dates & Notes">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Invoice Date"
                error={errors.invoiceDate}
                hint="Set automatically when moved to Raised"
              >
                <input
                  className="input"
                  type="date"
                  value={form.invoiceDate}
                  onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                />
              </Field>
              <Field label="Due Date" error={errors.dueDate}>
                <input
                  className="input"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </Field>
              <Field label="Notes" error={errors.notes} className="sm:col-span-2">
                <input
                  className="input"
                  placeholder="Optional"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </Field>
            </div>
          </FormSection>

          {agreementResources.length > 0 ? (
            <FormSection title="Resources Covered">
              <p className="mb-3 text-2xs text-ink3">
                Pulled from the agreement&apos;s rate card. Check the resources this
                invoice covers this period — not all of them need to be included.
              </p>
              <div className="space-y-1.5">
                {agreementResources.map((r) => {
                  const on = form.resourceIds.includes(r.resourceId);
                  return (
                    <label
                      key={r.resourceId}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors ${
                        on
                          ? 'border-brand bg-brandbg'
                          : 'border-line bg-surface hover:bg-surface2'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() =>
                            setForm({
                              ...form,
                              resourceIds: on
                                ? form.resourceIds.filter((x) => x !== r.resourceId)
                                : [...form.resourceIds, r.resourceId],
                            })
                          }
                          className="h-4 w-4 rounded border-line accent-[rgb(var(--accent))]"
                        />
                        <span className="text-sm text-ink">{r.resourceName}</span>
                      </span>
                      <span className="tnum text-xs text-ink2">
                        {formatMoney(r.billingAmount, form.currency)}/mo
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="tnum mt-2 flex items-baseline justify-between text-xs text-ink2">
                <span>
                  {form.resourceIds.length} of {agreementResources.length} selected
                </span>
                <span className="font-medium text-ink">
                  {formatMoney(
                    agreementResources
                      .filter((r) => form.resourceIds.includes(r.resourceId))
                      .reduce((s, r) => s + r.billingAmount, 0),
                    form.currency,
                  )}
                  /mo
                </span>
              </div>
            </FormSection>
          ) : (
            resources.length > 0 && (
              <FormSection title="Resources Covered">
                {loadingRateCard ? (
                  <p className="text-sm text-ink3">Loading rate card…</p>
                ) : (
                  <>
                    {form.agreementId && (
                      <p className="mb-2 text-2xs text-ink3">
                        This agreement has no registered resources yet — pick from the
                        full list instead.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {resources.map((r) => {
                        const on = form.resourceIds.includes(r.id);
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() =>
                              setForm({
                                ...form,
                                resourceIds: on
                                  ? form.resourceIds.filter((x) => x !== r.id)
                                  : [...form.resourceIds, r.id],
                              })
                            }
                            className={`chip border transition-colors ${
                              on
                                ? 'border-brand bg-brandbg text-brand'
                                : 'border-line bg-surface text-ink2 hover:bg-surface2'
                            }`}
                          >
                            {r.name}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </FormSection>
            )
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Invoice'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
