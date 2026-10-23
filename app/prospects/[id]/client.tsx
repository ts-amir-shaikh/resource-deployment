'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRightCircle, Pencil, Plus, Star, Trash2, Users } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import { PROSPECT_SOURCE_LABELS, TEMPERATURES, TEMPERATURE_LABELS, type ProspectSource } from '@/lib/leadgen-rules';
import type { getProspectDetail } from '@/lib/leadgen';
import { EmptyState, Field, Modal, PageHeader } from '@/components/ui';
import {
  BantEditor,
  DuplicateWarning,
  LeadStatusBadge,
  StageBadge,
  TemperatureBadge,
  duplicatesOf,
  type Bant,
  type DuplicateHit,
} from '@/components/leadgen-ui';
import { ActivityTimeline, LogActivityButton } from '@/components/activity-log';
import ProspectFormFields, { BLANK_PROSPECT, prospectPayload, type Option, type ProspectFormValues } from '@/components/prospect-form';

type Detail = NonNullable<Awaited<ReturnType<typeof getProspectDetail>>>;
type Contact = Detail['contacts'][number];

const BLANK_CONTACT = { name: '', designation: '', email: '', mobile: '', linkedin: '', isPrimary: false };

export default function ProspectDetailClient({
  detail,
  campaigns,
  owners,
  canSetOwner,
}: {
  detail: Detail;
  campaigns: Option[];
  owners: Option[];
  canSetOwner: boolean;
}) {
  const router = useRouter();
  const { prospect: p, contacts, activities, lead, access, campaign, client } = detail;
  const canEdit = access.edit;

  /* ── Edit ── */
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<ProspectFormValues>(BLANK_PROSPECT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setForm({
      ...BLANK_PROSPECT,
      companyName: p.companyName,
      stage: p.stage,
      temperature: p.temperature,
      ownerUserId: p.ownerUserId ? String(p.ownerUserId) : '',
      source: p.source ?? '',
      campaignId: p.campaignId ? String(p.campaignId) : '',
      website: p.website ?? '',
      industry: p.industry ?? '',
      location: p.location ?? '',
      notes: p.notes ?? '',
      deadReason: p.deadReason ?? '',
    });
    setErrors({});
    setBanner(null);
    setDuplicates([]);
    setEditOpen(true);
  }

  async function saveEdit(confirmDuplicate = false) {
    setSaving(true);
    setErrors({});
    setBanner(null);
    setDuplicates([]);
    try {
      await api(`/api/leadgen/prospects/${p.id}`, { method: 'PUT', json: prospectPayload(form, confirmDuplicate) });
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      const hits = duplicatesOf(e);
      if (hits.length) setDuplicates(hits);
      else setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  /* ── Contacts ── */
  const [contactOpen, setContactOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contact, setContact] = useState(BLANK_CONTACT);
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});

  function openContact(c: Contact | null) {
    setEditingContact(c);
    setContact(
      c
        ? {
            name: c.name,
            designation: c.designation ?? '',
            email: c.email ?? '',
            mobile: c.mobile ?? '',
            linkedin: c.linkedin ?? '',
            isPrimary: c.isPrimary,
          }
        : { ...BLANK_CONTACT, isPrimary: contacts.length === 0 },
    );
    setContactErrors({});
    setBanner(null);
    setContactOpen(true);
  }

  async function saveContact() {
    setSaving(true);
    setContactErrors({});
    setBanner(null);
    try {
      const base = `/api/leadgen/prospects/${p.id}/contacts`;
      await api(editingContact ? `${base}/${editingContact.id}` : base, {
        method: editingContact ? 'PUT' : 'POST',
        json: contact,
      });
      setContactOpen(false);
      router.refresh();
    } catch (e) {
      if (isApiError(e) && e.fields) setContactErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeContact(c: Contact) {
    if (!confirm(`Remove ${c.name}? Activities that name them keep their notes.`)) return;
    try {
      await api(`/api/leadgen/prospects/${p.id}/contacts/${c.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  /* ── Convert (D4, Q3) ── */
  const [convertOpen, setConvertOpen] = useState(false);
  const [convert, setConvert] = useState({ title: '', summary: '', temperature: p.temperature as string });
  const [bant, setBant] = useState<Bant>({ bantBudget: false, bantAuthority: false, bantNeed: false, bantTimeline: false });
  const [convertErrors, setConvertErrors] = useState<Record<string, string>>({});

  async function saveConvert() {
    setSaving(true);
    setConvertErrors({});
    setBanner(null);
    try {
      const created = await api<{ id: number }>(`/api/leadgen/prospects/${p.id}/convert`, {
        method: 'POST',
        json: { ...convert, ...bant },
      });
      router.push(`/lead-records/${created.id}`);
    } catch (e) {
      if (isApiError(e) && e.fields) setConvertErrors(e.fields);
      setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wider text-ink3">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || '—'}</dd>
    </div>
  );

  return (
    <div className="pb-12">
      <PageHeader
        title={p.companyName}
        subtitle={p.industry ? `${p.industry}${p.location ? ` · ${p.location}` : ''}` : (p.location ?? undefined)}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/prospects" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Prospects
            </Link>
            {canEdit && (
              <button className="btn-ghost" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {canEdit && p.stage === 'qualified' && !lead && (
              <button
                className="btn-primary"
                onClick={() => {
                  setConvertErrors({});
                  setBanner(null);
                  setConvertOpen(true);
                }}
              >
                <ArrowRightCircle className="h-4 w-4" /> Convert to Lead
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 px-6 py-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StageBadge value={p.stage} />
              <TemperatureBadge value={p.temperature} />
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {fact('Owner', p.ownerName)}
              {fact('Source', p.source ? PROSPECT_SOURCE_LABELS[p.source as ProspectSource] : null)}
              {fact('Campaign', campaign && <Link className="hover:underline" href={`/campaigns/${campaign.id}`}>{campaign.name}</Link>)}
              {fact(
                'Website',
                p.website && (
                  <a className="break-all hover:underline" href={p.website} target="_blank" rel="noopener noreferrer">
                    {p.website.replace(/^https?:\/\//, '')}
                  </a>
                ),
              )}
              {fact('Added', formatDate(p.createdAt))}
              {fact('Client', client?.name)}
            </dl>
            {p.stage === 'dead' && p.deadReason && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">Dead: {p.deadReason}</p>}
            {p.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-ink2">{p.notes}</p>}
            {lead && (
              <p className="mt-3 flex items-center gap-2 text-sm">
                Lead:{' '}
                <Link className="font-medium text-ink hover:underline" href={`/lead-records/${lead.id}`}>
                  {lead.title}
                </Link>
                <LeadStatusBadge value={lead.status} />
              </p>
            )}
            {canEdit && p.stage !== 'qualified' && !lead && p.stage !== 'dead' && (
              <p className="mt-3 text-xs text-ink3">Move the prospect to Qualified to convert it to a lead.</p>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Contacts</h2>
              {canEdit && (
                <button className="btn-ghost" onClick={() => openContact(null)}>
                  <Plus className="h-4 w-4" /> Add
                </button>
              )}
            </div>
            {contacts.length === 0 ? (
              <EmptyState icon={Users} title="No contacts yet" />
            ) : (
              <ul className="divide-y divide-line">
                {contacts.map((c) => (
                  <li key={c.id} className="px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 font-medium text-ink">
                        {c.isPrimary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Primary" />}
                        {c.name}
                      </span>
                      {canEdit && (
                        <span className="flex gap-1">
                          <button className="rounded p-1 text-ink3 hover:bg-surface2" onClick={() => openContact(c)} aria-label={`Edit ${c.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-ink3 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
                            onClick={() => removeContact(c)}
                            aria-label={`Remove ${c.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                    {c.designation && <div className="text-ink2">{c.designation}</div>}
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink3">
                      {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
                      {c.mobile && <span>{c.mobile}</span>}
                      {c.linkedin && (
                        <a href={c.linkedin} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          LinkedIn
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Activity</h2>
            {canEdit && (
              <LogActivityButton
                prospectId={p.id}
                stage={p.stage}
                contacts={contacts.map((c) => ({ id: c.id, name: c.name }))}
                campaigns={campaigns}
                defaultCampaignId={p.campaignId}
              />
            )}
          </div>
          <ActivityTimeline items={activities} />
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${p.companyName}`} wide>
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <ProspectFormFields
            form={form}
            setForm={setForm}
            errors={errors}
            campaigns={campaigns}
            owners={owners}
            canSetOwner={canSetOwner}
            creating={false}
            stageLocked={p.stage === 'converted'}
            excludeProspectId={p.id}
          />
          <DuplicateWarning hits={duplicates} onConfirm={() => saveEdit(true)} confirmLabel="Save anyway" />
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => saveEdit()} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title={editingContact ? `Edit ${editingContact.name}` : 'Add Contact'}>
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required error={contactErrors.name}>
              <input className="input" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
            </Field>
            <Field label="Designation" error={contactErrors.designation}>
              <input className="input" value={contact.designation} onChange={(e) => setContact({ ...contact, designation: e.target.value })} />
            </Field>
            <Field label="Email" error={contactErrors.email}>
              <input className="input" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
            </Field>
            <Field label="Mobile" error={contactErrors.mobile}>
              <input className="input" value={contact.mobile} onChange={(e) => setContact({ ...contact, mobile: e.target.value })} />
            </Field>
            <Field label="LinkedIn" error={contactErrors.linkedin} className="sm:col-span-2">
              <input
                className="input"
                value={contact.linkedin}
                onChange={(e) => setContact({ ...contact, linkedin: e.target.value })}
                placeholder="https://"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={contact.isPrimary} onChange={(e) => setContact({ ...contact, isPrimary: e.target.checked })} />
            Primary contact
          </label>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => setContactOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={saveContact} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="Convert to Lead"
        description="Creates a lead for this need. The prospect moves to Converted and cannot be converted again."
      >
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <Field label="What is the need?" required error={convertErrors.title}>
            <input
              className="input"
              value={convert.title}
              onChange={(e) => setConvert({ ...convert, title: e.target.value })}
              placeholder="e.g. 4 Java developers for the payments rebuild"
            />
          </Field>
          <Field label="Summary" error={convertErrors.summary}>
            <textarea className="input min-h-[72px]" value={convert.summary} onChange={(e) => setConvert({ ...convert, summary: e.target.value })} />
          </Field>
          <Field label="Temperature" error={convertErrors.temperature}>
            <select className="input" value={convert.temperature} onChange={(e) => setConvert({ ...convert, temperature: e.target.value })}>
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {TEMPERATURE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Qualified on (BANT)" hint="Shown to Sales at handoff. Ticks gate nothing.">
            <BantEditor value={bant} onChange={setBant} />
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => setConvertOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={saveConvert} disabled={saving}>
              {saving ? 'Converting…' : 'Convert'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
