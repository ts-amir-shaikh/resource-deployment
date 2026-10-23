'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, MessageSquare, Plus } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate, today } from '@/lib/utils';
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_OUTCOME_LABELS,
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  PROSPECT_STAGE_LABELS,
  stageAfterMeeting,
  type ActivityOutcome,
  type ActivityType,
  type ProspectStage,
} from '@/lib/leadgen-rules';
import { Badge, EmptyState, Field, Modal } from '@/components/ui';

/**
 * R2/R4: the activity timeline and the form that adds to it, shared by the
 * prospect and lead pages. Meetings are activities of type `meeting` (KTD2),
 * with attendees and a next step.
 */

export type ActivityItem = {
  id: number;
  type: string;
  activityDate: string;
  outcome: string | null;
  notes: string | null;
  nextFollowUp: string | null;
  attendees: string | null;
  nextStep: string | null;
  contactName: string | null;
  campaignName: string | null;
  byName: string | null;
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (!items.length) {
    return <EmptyState icon={MessageSquare} title="No activity yet" description="Calls, emails, LinkedIn touches and meetings appear here." />;
  }
  return (
    <ol className="divide-y divide-line">
      {items.map((a) => (
        <li key={a.id} className="px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={a.type === 'meeting' ? 'violet' : 'neutral'}>{ACTIVITY_TYPE_LABELS[a.type as ActivityType] ?? a.type}</Badge>
            <span className="tnum text-ink2">{formatDate(a.activityDate)}</span>
            {a.outcome && <Badge tone="blue">{ACTIVITY_OUTCOME_LABELS[a.outcome as ActivityOutcome] ?? a.outcome}</Badge>}
            {a.contactName && <span className="text-ink2">with {a.contactName}</span>}
            {a.campaignName && <span className="text-xs text-ink3">· {a.campaignName}</span>}
            <span className="ml-auto text-xs text-ink3">{a.byName ?? ''}</span>
          </div>
          {a.attendees && <p className="mt-1 text-ink2">Attendees: {a.attendees}</p>}
          {a.notes && <p className="mt-1 whitespace-pre-wrap text-ink">{a.notes}</p>}
          {(a.nextStep || a.nextFollowUp) && (
            <p className="mt-1 flex items-center gap-1 text-xs text-ink2">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              {a.nextStep}
              {a.nextStep && a.nextFollowUp && ' · '}
              {a.nextFollowUp && `follow up ${formatDate(a.nextFollowUp)}`}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

const blank = (campaignId: number | null) => ({
  type: 'call',
  activityDate: today(),
  contactId: '',
  outcome: '',
  notes: '',
  nextFollowUp: '',
  attendees: '',
  nextStep: '',
  campaignId: campaignId ? String(campaignId) : '',
  advanceStage: true,
});

export function LogActivityButton({
  prospectId,
  leadId,
  stage,
  contacts,
  campaigns,
  defaultCampaignId,
}: {
  prospectId: number | null;
  leadId?: number;
  /** The prospect's stage, for R4's "move to Meeting set" suggestion. */
  stage: string | null;
  contacts: { id: number; name: string }[];
  campaigns: { id: number; name: string }[];
  defaultCampaignId: number | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank(defaultCampaignId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const suggested = form.type === 'meeting' && stage ? stageAfterMeeting(stage as ProspectStage) : null;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save() {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      await api('/api/leadgen/activities', {
        method: 'POST',
        json: { ...form, prospectId: leadId ? null : prospectId, leadId: leadId ?? null, advanceStage: Boolean(suggested) && form.advanceStage },
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        className="btn-primary"
        onClick={() => {
          setForm(blank(defaultCampaignId));
          setErrors({});
          setBanner(null);
          setOpen(true);
        }}
      >
        <Plus className="h-4 w-4" /> Log Activity
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Log Activity">
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type" required error={errors.type}>
              <select className="input" value={form.type} onChange={set('type')}>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {ACTIVITY_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date" required error={errors.activityDate}>
              <input className="input" type="date" value={form.activityDate} onChange={set('activityDate')} />
            </Field>
            {contacts.length > 0 && (
              <Field label="Contact" error={errors.contactId}>
                <select className="input" value={form.contactId} onChange={set('contactId')}>
                  <option value="">—</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Outcome" error={errors.outcome}>
              <select className="input" value={form.outcome} onChange={set('outcome')}>
                <option value="">—</option>
                {ACTIVITY_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {ACTIVITY_OUTCOME_LABELS[o]}
                  </option>
                ))}
              </select>
            </Field>
            {form.type === 'meeting' && (
              <Field label="Attendees" error={errors.attendees} className="sm:col-span-2">
                <input className="input" value={form.attendees} onChange={set('attendees')} placeholder="Who was in the room" />
              </Field>
            )}
            <Field label="Notes" error={errors.notes} className="sm:col-span-2">
              <textarea className="input min-h-[72px]" value={form.notes} onChange={set('notes')} />
            </Field>
            <Field label="Next step" error={errors.nextStep}>
              <input className="input" value={form.nextStep} onChange={set('nextStep')} />
            </Field>
            <Field label="Follow up on" error={errors.nextFollowUp}>
              <input className="input" type="date" value={form.nextFollowUp} onChange={set('nextFollowUp')} />
            </Field>
            {campaigns.length > 0 && (
              <Field label="Campaign" error={errors.campaignId} className="sm:col-span-2">
                <select className="input" value={form.campaignId} onChange={set('campaignId')}>
                  <option value="">None</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>
          {suggested && (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={form.advanceStage}
                onChange={(e) => setForm({ ...form, advanceStage: e.target.checked })}
              />
              Move the prospect to {PROSPECT_STAGE_LABELS[suggested]}
            </label>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Log'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
