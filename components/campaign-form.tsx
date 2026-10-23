'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, errorMessage, isApiError } from '@/lib/client';
import { CAMPAIGN_CHANNELS, CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUSES, CAMPAIGN_STATUS_LABELS } from '@/lib/leadgen-rules';
import { Field, Modal } from '@/components/ui';

/** G-LED-03: create or edit a campaign. Shared by the list and the campaign page. */

export type CampaignValues = {
  id?: number;
  name: string;
  segment: string;
  channel: string;
  startDate: string;
  endDate: string;
  status: string;
  ownerUserId: string;
  notes: string;
};

export const BLANK_CAMPAIGN: CampaignValues = {
  name: '',
  segment: '',
  channel: 'mixed',
  startDate: '',
  endDate: '',
  status: 'planned',
  ownerUserId: '',
  notes: '',
};

export default function CampaignModal({
  open,
  onClose,
  initial,
  owners,
  canSetOwner,
}: {
  open: boolean;
  onClose: () => void;
  initial: CampaignValues;
  owners: { id: number; name: string }[];
  canSetOwner: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initial);
      setErrors({});
      setBanner(null);
    }
  }, [open, initial]);

  const set = (k: keyof CampaignValues) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const { id, ...body } = form;
      const row = await api<{ id: number }>(id ? `/api/leadgen/campaigns/${id}` : '/api/leadgen/campaigns', {
        method: id ? 'PUT' : 'POST',
        json: body,
      });
      onClose();
      if (id) router.refresh();
      else router.push(`/campaigns/${row.id}`);
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={form.id ? `Edit ${initial.name}` : 'New Campaign'}>
      <div className="space-y-4">
        {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <input className="input" value={form.name} onChange={set('name')} />
          </Field>
          <Field label="Segment" error={errors.segment} hint="Who it targets, e.g. BFSI, Mumbai, 200+ staff" className="sm:col-span-2">
            <input className="input" value={form.segment} onChange={set('segment')} />
          </Field>
          <Field label="Channel" error={errors.channel}>
            <select className="input" value={form.channel} onChange={set('channel')}>
              {CAMPAIGN_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CAMPAIGN_CHANNEL_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" error={errors.status}>
            <select className="input" value={form.status} onChange={set('status')}>
              {CAMPAIGN_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {CAMPAIGN_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts" error={errors.startDate}>
            <input className="input" type="date" value={form.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Ends" error={errors.endDate}>
            <input className="input" type="date" value={form.endDate} onChange={set('endDate')} />
          </Field>
          {canSetOwner && (
            <Field label="Owner" error={errors.ownerUserId} className="sm:col-span-2">
              <select className="input" value={form.ownerUserId} onChange={set('ownerUserId')}>
                <option value="">Unowned</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            <textarea className="input min-h-[72px]" value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
