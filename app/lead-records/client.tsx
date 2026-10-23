'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Search, Target } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { LEAD_STATUSES, LEAD_STATUS_LABELS, TEMPERATURES, TEMPERATURE_LABELS } from '@/lib/leadgen-rules';
import type { LeadListRow } from '@/lib/leadgen';
import { EmptyState, Field, Modal, PageHeader, TableShell } from '@/components/ui';
import { BantEditor, BantTicks, LeadStatusBadge, TemperatureBadge, type Bant } from '@/components/leadgen-ui';

const NO_BANT: Bant = { bantBudget: false, bantAuthority: false, bantNeed: false, bantTimeline: false };

export default function LeadRecordsClient({
  initial,
  clients,
  canCreate,
}: {
  initial: LeadListRow[];
  clients: { id: number; name: string }[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter(
      (l) =>
        (!status || l.status === status) &&
        (!q || l.companyName.toLowerCase().includes(q) || l.title.toLowerCase().includes(q)),
    );
  }, [initial, status, search]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ clientId: '', title: '', summary: '', temperature: 'warm' });
  const [bant, setBant] = useState<Bant>(NO_BANT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const row = await api<{ id: number }>('/api/leadgen/leads', { method: 'POST', json: { ...form, ...bant } });
      setOpen(false);
      router.push(`/lead-records/${row.id}`);
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
        title="Leads"
        subtitle="Qualified needs, from Leadgen's conversion to the requirements Sales raises"
        action={
          canCreate && (
            <button
              className="btn-primary"
              onClick={() => {
                setForm({ clientId: '', title: '', summary: '', temperature: 'warm' });
                setBant(NO_BANT);
                setErrors({});
                setBanner(null);
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Lead on a Client
            </button>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink3" />
          <input className="input w-56 pl-8" placeholder="Search company or need" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="px-6 py-4">
        <div className="card overflow-hidden">
          {initial.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No leads yet"
              description="A lead is made by converting a qualified prospect, or raised on an existing client."
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Lead</th>
                  <th className="th">Status</th>
                  <th className="th">Temperature</th>
                  <th className="th">BANT</th>
                  <th className="th">Leadgen</th>
                  <th className="th">Sales</th>
                  <th className="th text-right">Requirements</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <Link href={`/lead-records/${l.id}`} className="font-medium text-ink hover:underline">
                        {l.title}
                      </Link>
                      <div className="text-xs text-ink3">
                        {l.companyName}
                        {l.clientId && !l.prospectId ? ' · existing client' : ''}
                      </div>
                    </td>
                    <td className="td">
                      <LeadStatusBadge value={l.status} />
                    </td>
                    <td className="td">
                      <TemperatureBadge value={l.temperature} />
                    </td>
                    <td className="td">
                      <BantTicks value={l} compact />
                    </td>
                    <td className="td">{l.leadOwnerName ?? '—'}</td>
                    <td className="td">
                      {l.salesOwnerName ?? (l.handedOffAt ? <span className="text-amber-700 dark:text-amber-300">In queue</span> : '—')}
                    </td>
                    <td className="td tnum text-right">{l.requirementCount}</td>
                    <td className="td tnum">{formatDate(l.createdAt)}</td>
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
        title="Lead on an Existing Client"
        description="Account growth: a new need at a company we already serve. Leads on new companies come from converting a prospect."
      >
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <Field label="Client" required error={errors.clientId}>
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Pick a client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What is the need?" required error={errors.title}>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Summary" error={errors.summary}>
            <textarea className="input min-h-[72px]" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          </Field>
          <Field label="Temperature" error={errors.temperature}>
            <select className="input" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })}>
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {TEMPERATURE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Qualified on (BANT)">
            <BantEditor value={bant} onChange={setBant} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Create Lead'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
