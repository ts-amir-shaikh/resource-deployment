'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { Badge, EmptyState, Field, Modal, PageHeader, TableShell } from '@/components/ui';

type Row = {
  id: number;
  holidayDate: string;
  name: string;
  clientId: number | null;
  clientName: string | null;
};

const BLANK = { holidayDate: '', name: '', clientId: '' };

export default function HolidaysClient({
  initial,
  clients,
  canEdit,
}: {
  initial: Row[];
  clients: { id: number; companyName: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      await api('/api/holidays', { method: 'POST', json: form });
      setOpen(false);
      setForm(BLANK);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(h: Row) {
    if (!confirm(`Remove ${h.name} on ${formatDate(h.holidayDate)}? Days already marked as a holiday stay as they are.`)) return;
    try {
      await api(`/api/holidays/${h.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  return (
    <div className="pb-12">
      <PageHeader
        title="Holidays"
        subtitle="Pre-filled on timesheets. Company-wide, or for one client's resources."
        action={
          canEdit && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Add Holiday
            </button>
          )
        }
      />

      <div className="px-6 py-4">
        <div className="card overflow-hidden">
          {initial.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No holidays yet"
              description="Add the year's holidays so resources do not have to mark them by hand."
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Holiday</th>
                  <th className="th">Applies to</th>
                  {canEdit && <th className="th w-16 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {initial.map((h) => (
                  <tr key={h.id} className="hover:bg-surface2/50">
                    <td className="td tnum">{formatDate(h.holidayDate)}</td>
                    <td className="td text-ink">{h.name}</td>
                    <td className="td">
                      {h.clientName ? <Badge tone="blue">{h.clientName}</Badge> : <Badge>Company-wide</Badge>}
                    </td>
                    {canEdit && (
                      <td className="td text-right">
                        <button
                          onClick={() => remove(h)}
                          className="rounded p-1.5 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                          aria-label={`Remove ${h.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Holiday">
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <Field label="Date" required error={errors.holidayDate}>
            <input
              className="input"
              type="date"
              value={form.holidayDate}
              onChange={(e) => setForm({ ...form, holidayDate: e.target.value })}
            />
          </Field>
          <Field label="Name" required error={errors.name}>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Applies to" error={errors.clientId} hint="Leave as company-wide unless only one client observes it">
            <select className="input" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Company-wide</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
