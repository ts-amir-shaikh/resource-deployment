'use client';

import { useEffect, useState } from 'react';
import { Field, FormSection } from '@/components/ui';
import { api } from '@/lib/client';
import {
  PROSPECT_SOURCES,
  PROSPECT_SOURCE_LABELS,
  PROSPECT_STAGE_LABELS,
  SETTABLE_PROSPECT_STAGES,
  TEMPERATURES,
  TEMPERATURE_LABELS,
} from '@/lib/leadgen-rules';
import { DuplicateWarning, type DuplicateHit } from '@/components/leadgen-ui';

/** The prospect form (R1), shared by the list's "Add" and the detail page's "Edit". */

export type Option = { id: number; name: string };

export type ProspectFormValues = {
  companyName: string;
  stage: string;
  temperature: string;
  ownerUserId: string;
  source: string;
  campaignId: string;
  website: string;
  industry: string;
  location: string;
  notes: string;
  deadReason: string;
  /** Create only — the first contact. */
  contactName: string;
  contactDesignation: string;
  contactEmail: string;
  contactMobile: string;
  contactLinkedin: string;
};

export const BLANK_PROSPECT: ProspectFormValues = {
  companyName: '',
  stage: 'new',
  temperature: 'cold',
  ownerUserId: '',
  source: '',
  campaignId: '',
  website: '',
  industry: '',
  location: '',
  notes: '',
  deadReason: '',
  contactName: '',
  contactDesignation: '',
  contactEmail: '',
  contactMobile: '',
  contactLinkedin: '',
};

export function prospectPayload(f: ProspectFormValues, confirmDuplicate: boolean) {
  const { contactName, contactDesignation, contactEmail, contactMobile, contactLinkedin, ...rest } = f;
  return {
    ...rest,
    contacts: contactName.trim()
      ? [
          {
            name: contactName,
            designation: contactDesignation,
            email: contactEmail,
            mobile: contactMobile,
            linkedin: contactLinkedin,
            isPrimary: true,
          },
        ]
      : [],
    confirmDuplicate,
  };
}

export default function ProspectFormFields({
  form,
  setForm,
  errors,
  campaigns,
  owners,
  canSetOwner,
  creating,
  stageLocked,
  excludeProspectId,
}: {
  form: ProspectFormValues;
  setForm: (v: ProspectFormValues) => void;
  errors: Record<string, string>;
  campaigns: Option[];
  owners: Option[];
  canSetOwner: boolean;
  creating: boolean;
  /** A converted prospect's stage is fixed. */
  stageLocked?: boolean;
  excludeProspectId?: number;
}) {
  const set = (k: keyof ProspectFormValues) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  // G-LED-06: warn while typing, before anyone presses save. The server
  // checks again on save regardless.
  const [hits, setHits] = useState<DuplicateHit[]>([]);
  useEffect(() => {
    const name = form.companyName.trim();
    if (name.length < 3) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      const q = new URLSearchParams({ name });
      if (excludeProspectId) q.set('prospect', String(excludeProspectId));
      api<DuplicateHit[]>(`/api/leadgen/duplicates?${q}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 350);
    return () => clearTimeout(t);
  }, [form.companyName, excludeProspectId]);

  return (
    <div className="space-y-5">
      <FormSection title="Company">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" required error={errors.companyName} className="sm:col-span-2">
            <input className="input" value={form.companyName} onChange={set('companyName')} autoFocus />
          </Field>
          {hits.length > 0 && (
            <div className="sm:col-span-2">
              <DuplicateWarning hits={hits} />
            </div>
          )}
          <Field label="Stage" error={errors.stage}>
            <select className="input" value={form.stage} onChange={set('stage')} disabled={stageLocked}>
              {stageLocked ? (
                <option value={form.stage}>{PROSPECT_STAGE_LABELS.converted}</option>
              ) : (
                SETTABLE_PROSPECT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {PROSPECT_STAGE_LABELS[s]}
                  </option>
                ))
              )}
            </select>
          </Field>
          <Field label="Temperature" error={errors.temperature} hint="How warm the conversation is — separate from stage">
            <select className="input" value={form.temperature} onChange={set('temperature')}>
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {TEMPERATURE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          {form.stage === 'dead' && (
            <Field label="Why is it dead?" required error={errors.deadReason} className="sm:col-span-2">
              <input className="input" value={form.deadReason} onChange={set('deadReason')} />
            </Field>
          )}
          {canSetOwner && (
            <Field label="Owner" error={errors.ownerUserId}>
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
          <Field label="Source" error={errors.source}>
            <select className="input" value={form.source} onChange={set('source')}>
              <option value="">—</option>
              {PROSPECT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {PROSPECT_SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campaign" error={errors.campaignId}>
            <select className="input" value={form.campaignId} onChange={set('campaignId')}>
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Website" error={errors.website}>
            <input className="input" value={form.website} onChange={set('website')} placeholder="https://" />
          </Field>
          <Field label="Industry" error={errors.industry}>
            <input className="input" value={form.industry} onChange={set('industry')} />
          </Field>
          <Field label="Location" error={errors.location}>
            <input className="input" value={form.location} onChange={set('location')} />
          </Field>
          <Field label="Notes" error={errors.notes} className="sm:col-span-2">
            <textarea className="input min-h-[72px]" value={form.notes} onChange={set('notes')} />
          </Field>
        </div>
      </FormSection>

      {creating && (
        <FormSection title="First contact (optional)">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" error={errors['contacts.0.name']}>
              <input className="input" value={form.contactName} onChange={set('contactName')} />
            </Field>
            <Field label="Designation">
              <input className="input" value={form.contactDesignation} onChange={set('contactDesignation')} />
            </Field>
            <Field label="Email" error={errors['contacts.0.email']}>
              <input className="input" type="email" value={form.contactEmail} onChange={set('contactEmail')} />
            </Field>
            <Field label="Mobile">
              <input className="input" value={form.contactMobile} onChange={set('contactMobile')} />
            </Field>
            <Field label="LinkedIn" error={errors['contacts.0.linkedin']} className="sm:col-span-2">
              <input className="input" value={form.contactLinkedin} onChange={set('contactLinkedin')} placeholder="https://" />
            </Field>
          </div>
        </FormSection>
      )}
    </div>
  );
}
