'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { api, errorMessage } from '@/lib/client';
import { formatDate, formatMoney } from '@/lib/utils';
import { Badge, EmptyState, PageHeader, Pagination, Stat, TableShell, type Tone } from '@/components/ui';
import type { ActivityDay, DashboardData, DashFilters, InvoicesTabData } from '@/lib/timesheet-dashboard';
import {
  ENTRY_STATUS_LABELS,
  ENTRY_STATUSES,
  ENTRY_TYPE_LABELS,
  TASK_KIND_LABELS,
  coverageLabel,
  type EntryStatus,
} from '@/lib/timesheet-rules';
import type { DayTone } from '@/lib/timesheet-week';

type Option = { id: number; name: string };
type TabId = 'overview' | 'resources' | 'deployments' | 'invoices' | 'activities';

const TABS: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'resources', label: 'Resources' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'activities', label: 'Activities' },
];

const STATUS_TONE: Record<EntryStatus, Tone> = { draft: 'neutral', submitted: 'amber', approved: 'green', rejected: 'rose' };

const FLAG_LABEL = {
  raised_before_approved: 'Raised before the period was fully approved',
  leave_typed_but_approved: 'Leave typed by hand; timesheets are now fully approved',
} as const;

/** Hours, to one decimal and without a trailing .0. */
function h(n: number): string {
  return `${Math.round(n * 10) / 10} h`;
}

/** Null is "—", never 0 (BR-TSH-10). */
function pct(n: number | null): string {
  return n === null ? '—' : `${n}%`;
}

export default function TimesheetDashboardClient({
  data,
  filters,
  tab: initialTab,
  invoiceId,
  options,
  periodError,
}: {
  data: DashboardData;
  filters: DashFilters;
  tab: string;
  invoiceId: number | null;
  options: { resources: Option[]; clients: Option[]; projects: Option[] };
  periodError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : 'overview');
  const o = data.overview;

  /** Filters live in the URL, so a link from another screen and a reload land on the same view. */
  function go(next: Partial<Record<string, string>>) {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = {
      tab,
      from: filters.from,
      to: filters.to,
      resource: filters.resourceId?.toString(),
      client: filters.clientId?.toString(),
      project: filters.projectId?.toString(),
      deployment: filters.deploymentId?.toString(),
      invoice: invoiceId?.toString(),
      ...next,
    };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    router.push(`${pathname}?${p.toString()}`);
  }

  function chooseTab(t: TabId) {
    setTab(t);
    const p = new URLSearchParams(window.location.search);
    p.set('tab', t);
    window.history.replaceState(null, '', `${pathname}?${p.toString()}`);
  }

  const thisMonth = () => {
    const d = new Date();
    const from = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0)).toISOString().slice(0, 10);
    go({ from, to, invoice: undefined });
  };
  const lastMonth = () => {
    const d = new Date();
    const from = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 0)).toISOString().slice(0, 10);
    go({ from, to, invoice: undefined });
  };

  return (
    <div className="pb-12">
      <PageHeader
        title="Timesheet Dashboard"
        subtitle={`Approved time only · ${formatDate(data.period.from)} to ${formatDate(data.period.to)}`}
      />

      <div className="space-y-4 px-6 py-4">
        {periodError && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {periodError} Showing this month instead.
          </p>
        )}

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5">
            <button className="btn-ghost" onClick={thisMonth}>This month</button>
            <button className="btn-ghost" onClick={lastMonth}>Last month</button>
          </div>
          <label className="text-2xs text-ink3">
            From
            <input className="input mt-0.5 w-auto" type="date" value={filters.from} onChange={(e) => e.target.value && go({ from: e.target.value, invoice: undefined })} />
          </label>
          <label className="text-2xs text-ink3">
            To
            <input className="input mt-0.5 w-auto" type="date" value={filters.to} onChange={(e) => e.target.value && go({ to: e.target.value, invoice: undefined })} />
          </label>
          <Select label="Resource" value={filters.resourceId} options={options.resources} onChange={(v) => go({ resource: v, deployment: undefined })} />
          <Select label="Client" value={filters.clientId} options={options.clients} onChange={(v) => go({ client: v, deployment: undefined })} />
          <Select label="Project" value={filters.projectId} options={options.projects} onChange={(v) => go({ project: v, deployment: undefined })} />
          {(filters.resourceId || filters.clientId || filters.projectId || filters.deploymentId) && (
            <button className="btn-ghost" onClick={() => go({ resource: undefined, client: undefined, project: undefined, deployment: undefined, invoice: undefined })}>
              Clear filters
            </button>
          )}
        </div>

        <div className="flex gap-1 border-b border-line" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => chooseTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id ? 'border-brand text-brand' : 'border-transparent text-ink2 hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview data={data} filters={filters} />}
        {tab === 'resources' && <ResourcesTab data={data} />}
        {tab === 'deployments' && <DeploymentsTab data={data} />}
        {tab === 'invoices' && <InvoicesTab data={data} filters={filters} invoiceId={invoiceId} />}
        {tab === 'activities' && <ActivitiesTab data={data} filters={filters} />}
      </div>
    </div>
  );
}

function Overview({ data, filters }: { data: DashboardData; filters: DashFilters }) {
  const o = data.overview;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Billable utilisation" value={pct(o.billableUtilisation)} sub={`${h(o.clientWorkHours)} of ${h(o.capacityHours)}`} info="Approved client-work hours (including hours with no client tasks) divided by capacity: working days × 8 hours. Measures time, not money." />
        <Stat label="Task-backed utilisation" value={pct(o.taskBackedUtilisation)} sub={`${h(o.taskedWorkHours)} with client tasks`} info="Approved client-work hours that have real client tasks behind them, divided by capacity." />
        <Stat label="No client tasks" value={h(o.noClientTaskHours)} sub="Billed, but nothing assigned" tone={o.noClientTaskHours > 0 ? 'warn' : 'default'} info='Approved hours logged against the fixed task "No client tasks assigned". These are billed.' />
        <Stat label="Shadow work" value={h(o.shadowHours)} sub="Not billed" />
        <Stat label="Leave" value={h(o.paidLeaveHours + o.unpaidLeaveHours)} sub={`${h(o.paidLeaveHours)} paid · ${h(o.unpaidLeaveHours)} unpaid`} />
        <Stat label="Remaining" value={h(o.remainingHours)} sub="Bench, internal tasks or not yet logged" info="Capacity less client work, shadow work, leave and holiday. Internal tasks are not tracked in timesheets, so that time shows here." />
        <Stat label="Waiting for approval" value={String(data.backlog.submittedDays)} sub={data.backlog.oldestSubmittedAt ? `oldest since ${formatDate(data.backlog.oldestSubmittedAt.slice(0, 10))}` : 'Nothing waiting'} tone={data.backlog.submittedDays > 0 ? 'warn' : 'default'} />
        <Stat label="Rejected, not resubmitted" value={String(data.backlog.rejectedDays)} tone={data.backlog.rejectedDays > 0 ? 'bad' : 'default'} />
      </div>
      {(o.pendingHours > 0 || o.rejectedHours > 0) && (
        <p className="text-xs text-ink2">
          Not counted above: {h(o.pendingHours)} submitted and waiting, {h(o.rejectedHours)} rejected.
        </p>
      )}
      {o.overAllocatedCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5" /> {o.overAllocatedCount} resource{o.overAllocatedCount === 1 ? ' has' : 's have'} deployments adding up to more than one standard day.
        </p>
      )}
      <div className="card p-4">
        <h2 className="text-sm font-semibold text-ink">Most remaining hours</h2>
        {o.mostRemaining.length === 0 ? (
          <p className="mt-2 text-xs text-ink3">Nobody has remaining hours in this period.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line text-sm">
            {o.mostRemaining.map((r) => (
              <li key={r.resourceId} className="flex justify-between py-1.5">
                <Link className="text-brand hover:underline" href={`/timesheets?tab=resources&resource=${r.resourceId}&from=${filters.from}&to=${filters.to}`}>{r.resourceName}</Link>
                <span className="tnum text-ink2">{h(r.remainingHours)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value?: number; options: Option[]; onChange: (v: string | undefined) => void }) {
  return (
    <label className="text-2xs text-ink3">
      {label}
      <select className="input mt-0.5 w-auto" value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
        <option value="">All</option>
        {options.map((x) => (
          <option key={x.id} value={x.id}>{x.name}</option>
        ))}
      </select>
    </label>
  );
}

function ResourcesTab({ data }: { data: DashboardData }) {
  if (!data.resources.length) return <EmptyState title="No deployments in this period" description="Nobody was deployed on these dates with these filters." />;
  return (
    <TableShell>
      <thead className="border-b border-line bg-surface2">
        <tr>
          <th className="th">Resource</th>
          <th className="th text-right">Capacity</th>
          <th className="th text-right">Client work</th>
          <th className="th text-right">No client tasks</th>
          <th className="th text-right">Shadow</th>
          <th className="th text-right">Leave</th>
          <th className="th text-right">Remaining</th>
          <th className="th text-right">Billable</th>
          <th className="th text-right">Task-backed</th>
          <th className="th text-right">Pending</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {data.resources.map((r) => (
          <tr key={r.resourceId}>
            <td className="td">
              <Link className="font-medium text-brand hover:underline" href={`/resources/${r.resourceId}`}>{r.resourceName}</Link>
              {r.overAllocated && <Badge tone="amber" className="ml-2">over 8 h/day</Badge>}
            </td>
            <td className="td tnum text-right">{h(r.capacityHours)}</td>
            <td className="td tnum text-right">{h(r.clientWorkHours)}</td>
            <td className="td tnum text-right">{h(r.noClientTaskHours)}</td>
            <td className="td tnum text-right">{h(r.shadowHours)}</td>
            <td className="td tnum text-right">{h(r.paidLeaveHours + r.unpaidLeaveHours)}</td>
            <td className="td tnum text-right">{h(r.remainingHours)}</td>
            <td className="td tnum text-right">{pct(r.billableUtilisation)}</td>
            <td className="td tnum text-right">{pct(r.taskBackedUtilisation)}</td>
            <td className="td tnum text-right text-ink3">{r.pendingHours ? h(r.pendingHours) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function DeploymentsTab({ data }: { data: DashboardData }) {
  if (!data.deployments.length) return <EmptyState title="No deployments in this period" />;
  return (
    <TableShell>
      <thead className="border-b border-line bg-surface2">
        <tr>
          <th className="th">Deployment</th>
          <th className="th">Type</th>
          <th className="th text-right">Alloc.</th>
          <th className="th text-right">Hours/day</th>
          <th className="th text-right">Expected</th>
          <th className="th text-right">Approved</th>
          <th className="th text-right">No client tasks</th>
          <th className="th text-right">Pending</th>
          <th className="th text-right">Rejected</th>
          <th className="th text-right">Utilisation</th>
          <th className="th">Days approved</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {data.deployments.map((d) => (
          <tr key={d.id}>
            <td className="td">
              <Link className="font-medium text-brand hover:underline" href={`/deployments/${d.id}`}>{d.resourceName}</Link>
              <div className="text-2xs text-ink3">{d.projectName} · {d.clientName}</div>
            </td>
            <td className="td"><Badge tone={d.billable ? 'green' : 'neutral'}>{d.billable ? 'Billable' : 'Shadow'}</Badge></td>
            <td className="td tnum text-right">{d.allocationPercentage}%</td>
            <td className="td tnum text-right">{d.fullDayHours}</td>
            <td className="td tnum text-right">{h(d.expectedHours)}</td>
            <td className="td tnum text-right">{h(d.approvedHours)}</td>
            <td className="td tnum text-right">{h(d.noClientTaskHours)}</td>
            <td className="td tnum text-right text-ink3">{d.pendingHours ? h(d.pendingHours) : '—'}</td>
            <td className="td tnum text-right text-ink3">{d.rejectedHours ? h(d.rejectedHours) : '—'}</td>
            <td className="td tnum text-right">{pct(d.utilisation)}</td>
            <td className="td text-xs text-ink2">{coverageLabel(d.coverage)}</td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

function InvoicesTab({ data, filters, invoiceId }: { data: DashboardData; filters: DashFilters; invoiceId: number | null }) {
  const [inv, setInv] = useState<InvoicesTabData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams({ part: 'invoices', from: filters.from, to: filters.to });
    if (filters.resourceId) p.set('resource', String(filters.resourceId));
    if (filters.clientId) p.set('client', String(filters.clientId));
    if (filters.projectId) p.set('project', String(filters.projectId));
    if (filters.deploymentId) p.set('deployment', String(filters.deploymentId));
    let live = true;
    setInv(null);
    api<InvoicesTabData>(`/api/timesheets/dashboard?${p.toString()}`)
      .then((d) => live && setInv(d))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [filters]);

  if (error) return <p className="text-sm text-rose-600">{error}</p>;
  if (!inv) return <p className="text-sm text-ink3">Checking invoice lines against the timesheets…</p>;
  const lines = invoiceId ? inv.lines.filter((l) => l.invoiceId === invoiceId) : inv.lines;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink2">
        Amounts are read from each invoice line as it was raised. Billing is the fixed monthly rate, pro-rated by days; nothing here is recalculated, and currencies are never added together.
      </p>
      {invoiceId && (
        <p className="text-xs text-ink2">
          Showing invoice #{invoiceId}.{' '}
          <Link className="text-brand hover:underline" href={`/timesheets?tab=invoices&from=${data.period.from}&to=${data.period.to}`}>Show all</Link>
        </p>
      )}
      {inv.billedByCurrency.length > 0 && !invoiceId && (
        <div className="flex flex-wrap gap-3">
          {inv.billedByCurrency.map((c) => (
            <Stat key={c.currency} label={`Billed (${c.currency})`} value={formatMoney(c.amount, c.currency)} sub="Before GST, lines in this period" />
          ))}
        </div>
      )}
      {lines.length === 0 ? (
        <EmptyState title="No invoice lines in this period" />
      ) : (
        <TableShell>
          <thead className="border-b border-line bg-surface2">
            <tr>
              <th className="th">Invoice</th>
              <th className="th">Resource</th>
              <th className="th">Timesheet coverage</th>
              <th className="th">Leave</th>
              <th className="th text-right">Monthly rate</th>
              <th className="th text-right">Billed days</th>
              <th className="th text-right">Amount</th>
              <th className="th">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lines.map((l, i) => (
              <tr key={`${l.invoiceId}-${l.resourceId}-${i}`}>
                <td className="td">
                  <Link className="font-medium text-brand hover:underline" href={`/invoices/${l.invoiceId}`}>{l.invoiceNumber ?? `#${l.invoiceId}`}</Link>
                  <div className="text-2xs text-ink3">{formatDate(l.periodFrom)} – {formatDate(l.periodTo)} · {l.invoiceStatus.replace(/_/g, ' ')}</div>
                </td>
                <td className="td">{l.resourceName}<div className="text-2xs text-ink3">{l.projectName}</div></td>
                <td className="td text-xs">{coverageLabel(l.coverage)}</td>
                <td className="td text-xs">
                  {l.paidLeaveDays}d paid · {l.unpaidLeaveDays}d unpaid
                  <div className="text-2xs text-ink3">{l.leaveFromTimesheet ? 'from timesheets' : 'entered by hand'}</div>
                </td>
                <td className="td tnum text-right">{l.legacy ? '—' : formatMoney(l.monthlyRate, l.currency)}</td>
                <td className="td tnum text-right">{l.legacy ? '—' : l.billedDays == null ? 'Full month' : `${l.billedDays}${l.workingDays ? ` of ${l.workingDays}` : ''}`}</td>
                <td className="td tnum text-right">{l.legacy ? '—' : formatMoney(l.amount, l.currency)}</td>
                <td className="td">
                  {l.flags.length === 0 ? <span className="text-ink3">—</span> : l.flags.map((f) => <Badge key={f} tone="amber" className="mb-0.5 mr-1">{FLAG_LABEL[f]}</Badge>)}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {!invoiceId && inv.uninvoiced.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-semibold text-ink">Approved billable days with no invoice line</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {inv.uninvoiced.map((u) => (
              <li key={u.deploymentId} className="flex justify-between py-1.5">
                <span>{u.resourceName} <span className="text-ink3">· {u.projectName} · {u.clientName}</span></span>
                <span className="tnum text-ink2">{u.approvedDays} days</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const DAY_TONE_CLASS: Record<DayTone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  short: 'text-rose-700 dark:text-rose-300',
  over: 'text-rose-700 dark:text-rose-300',
  holiday: 'text-rose-700 dark:text-rose-300',
  leave: 'text-violet-700 dark:text-violet-300',
  rest: 'text-ink3',
  wait: 'text-ink3',
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hrs = (n: number) => `${Math.round(n * 100) / 100} h`;

/**
 * The activity log, one row per resource per day: what was worked on, whether
 * it was a full day, and where it stands. Click a day for the entries behind it.
 */
function ActivitiesTab({ data, filters }: { data: DashboardData; filters: DashFilters }) {
  const [status, setStatus] = useState<EntryStatus | ''>('');
  const [page, setPage] = useState(1);
  const [log, setLog] = useState<{ days: ActivityDay[]; total: number; pageSize: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = new URLSearchParams({ from: filters.from, to: filters.to, page: String(page) });
    if (status) p.set('status', status);
    if (filters.resourceId) p.set('resource', String(filters.resourceId));
    if (filters.clientId) p.set('client', String(filters.clientId));
    if (filters.projectId) p.set('project', String(filters.projectId));
    if (filters.deploymentId) p.set('deployment', String(filters.deploymentId));
    try {
      setError(null);
      setLog(await api(`/api/timesheets/entries?${p.toString()}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [filters, status, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const o = data.overview;
  const kinds: [string, number][] = [
    ['Client work', o.taskedWorkHours],
    ['No client tasks', o.noClientTaskHours],
    ['Shadow work', o.shadowHours],
    ['Leave', o.paidLeaveHours + o.unpaidLeaveHours],
    ['Holiday', o.holidayHours],
    ['Remaining', o.remainingHours],
  ];

  // Group the page's days under each resource (they arrive sorted by resource).
  const groups: { key: string; resourceName: string; clientName: string; projectName: string; days: ActivityDay[] }[] = [];
  for (const d of log?.days ?? []) {
    const key = `${d.resourceId}:${d.projectName}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(d);
    else groups.push({ key, resourceName: d.resourceName, clientName: d.clientName, projectName: d.projectName, days: [d] });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {kinds.map(([label, hours]) => (
          <Stat key={label} label={label} value={h(hours)} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-2xs text-ink3">
          Status
          <select className="input mt-0.5 w-auto" value={status} onChange={(e) => { setStatus(e.target.value as EntryStatus | ''); setPage(1); }}>
            <option value="">All</option>
            {ENTRY_STATUSES.map((s) => <option key={s} value={s}>{ENTRY_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {!log ? (
        <p className="text-sm text-ink3">Loading…</p>
      ) : log.days.length === 0 ? (
        <EmptyState title="No entries" description="Nothing was recorded in this period with these filters." />
      ) : (
        <>
          <div className="space-y-4">
            {groups.map((g) => {
              const sum = g.days.reduce((s, d) => s + d.total, 0);
              const waiting = g.days.filter((d) => d.status === 'submitted').length;
              const approved = g.days.filter((d) => d.status === 'approved').length;
              return (
                <div key={g.key} className="card overflow-hidden">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-surface2 px-4 py-2.5">
                    <div>
                      <span className="font-semibold text-ink">{g.resourceName}</span>
                      <span className="ml-2 text-xs text-ink3">{g.projectName} · {g.clientName}</span>
                    </div>
                    <span className="tnum text-xs text-ink2">
                      {h(sum)} · {approved} approved{waiting ? ` · ${waiting} waiting` : ''}
                    </span>
                  </div>
                  <TableShell>
                    <thead>
                      <tr className="border-b border-line text-2xs uppercase tracking-wider text-ink3">
                        <th className="th w-32">Day</th>
                        <th className="th w-44">Total</th>
                        <th className="th">What was worked on</th>
                        <th className="th w-56">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {g.days.map((d) => {
                        const wd = WEEKDAY[new Date(`${d.date}T00:00:00Z`).getUTCDay()];
                        const isOpen = open === d.key;
                        return (
                          <>
                            <tr key={d.key} className="cursor-pointer hover:bg-surface2" onClick={() => setOpen(isOpen ? null : d.key)}>
                              <td className="td whitespace-nowrap">
                                <span className="font-medium text-ink">{wd}</span> <span className="text-ink2">{formatDate(d.date)}</span>
                              </td>
                              <td className="td">
                                {d.holidayName && d.total === 0 ? (
                                  <span className="font-medium text-rose-700 dark:text-rose-300">Holiday</span>
                                ) : (
                                  <>
                                    <span className={`tnum font-semibold ${DAY_TONE_CLASS[d.tone]}`}>{d.total ? hrs(d.total) : '–'}</span>
                                    {d.reason && <span className={`ml-2 text-xs ${DAY_TONE_CLASS[d.tone]}`}>{d.reason}</span>}
                                  </>
                                )}
                              </td>
                              <td className="td text-sm text-ink2">
                                {d.holidayName && d.total === 0
                                  ? d.holidayName
                                  : [
                                      ...d.tasks.map((t) => `${t.label} ${Math.round(t.hours * 100) / 100}`),
                                      ...(d.leave ? [`${d.leave.fromRequest ? 'Leave' : 'Leave (entered earlier)'} ${Math.round(d.leave.hours * 100) / 100}`] : []),
                                    ].join(' · ') || '—'}
                              </td>
                              <td className="td">
                                {d.status && <Badge tone={STATUS_TONE[d.status]}>{ENTRY_STATUS_LABELS[d.status]}</Badge>}
                                {d.status === 'rejected' && d.rejectionReason ? (
                                  <div className="mt-0.5 text-2xs text-rose-600">{d.rejectionReason}</div>
                                ) : d.reviewedBy ? (
                                  <div className="mt-0.5 text-2xs text-ink3">
                                    {d.reviewedBy}{d.reviewedAt ? `, ${formatDate(d.reviewedAt.slice(0, 10))}` : ''}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr key={`${d.key}-detail`} className="bg-surface2">
                                <td className="td" />
                                <td className="td text-xs text-ink3" colSpan={3}>
                                  <ul className="space-y-0.5">
                                    {d.entries.map((e) => (
                                      <li key={e.id} className="flex gap-3">
                                        <span className="w-24 text-ink2">{ENTRY_TYPE_LABELS[e.entryType]}</span>
                                        <span className="tnum w-14 text-right text-ink">{e.hours} h</span>
                                        <span className="text-ink2">{e.taskKind ? TASK_KIND_LABELS[e.taskKind] : (e.task ?? '')}</span>
                                        <span className="ml-auto">{ENTRY_STATUS_LABELS[e.status]}</span>
                                      </li>
                                    ))}
                                  </ul>
                                  {!d.billable && <p className="mt-1">Shadow deployment: not billed.</p>}
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </TableShell>
                </div>
              );
            })}
          </div>
          <Pagination page={page} pageSize={log.pageSize} total={log.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
