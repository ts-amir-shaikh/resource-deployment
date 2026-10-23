'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Briefcase, Pencil, Send, UserCheck } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate } from '@/lib/utils';
import {
  LEAD_STATUS_LABELS,
  TEMPERATURES,
  TEMPERATURE_LABELS,
  leadMovesFrom,
  type LeadStatus,
} from '@/lib/leadgen-rules';
import type { getLeadDetail } from '@/lib/leadgen';
import { Badge, Field, Modal, PageHeader } from '@/components/ui';
import { BantEditor, BantTicks, LeadStatusBadge, TemperatureBadge, type Bant } from '@/components/leadgen-ui';
import { ActivityTimeline, LogActivityButton } from '@/components/activity-log';
import OpportunityFormFields, {
  BLANK_OPPORTUNITY,
  toPayload,
  type ClientOption,
  type OpportunityFormValues,
  type ProspectOption,
} from '@/components/opportunity-form';

type Detail = NonNullable<Awaited<ReturnType<typeof getLeadDetail>>>;
type Option = { id: number; name: string };

export default function LeadDetailClient({
  detail,
  salesTeam,
  campaigns,
  clients,
  prospects,
}: {
  detail: Detail;
  salesTeam: Option[];
  campaigns: Option[];
  clients: ClientOption[];
  prospects: ProspectOption[];
}) {
  const router = useRouter();
  const { lead: l, activities, requirements, access, canRaise, canAssign, canHandOff } = detail;
  const [banner, setBanner] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit(url: string, method: string, json: unknown, after: () => void) {
    setSaving(true);
    setErrors({});
    setBanner(null);
    try {
      const res = await api<{ id: number }>(url, { method, json });
      after();
      router.refresh();
      return res;
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      setBanner(errorMessage(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  /* ── Edit ── */
  const bantOf = (): Bant => ({
    bantBudget: l.bantBudget,
    bantAuthority: l.bantAuthority,
    bantNeed: l.bantNeed,
    bantTimeline: l.bantTimeline,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ title: '', summary: '', temperature: 'warm', status: '', closedReason: '' });
  const [bant, setBant] = useState<Bant>(bantOf());
  const moves = leadMovesFrom(l.status as LeadStatus).filter((s) => s === 'open' || s === 'closed_lost');

  function openEdit() {
    setForm({ title: l.title, summary: l.summary ?? '', temperature: l.temperature, status: '', closedReason: l.closedReason ?? '' });
    setBant(bantOf());
    setErrors({});
    setBanner(null);
    setEditOpen(true);
  }

  /* ── Handoff (Q2) ── */
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [suggested, setSuggested] = useState('');

  /* ── Assign (Q2) ── */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState('');

  /* ── Raise requirement (R5) ── */
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [req, setReq] = useState<OpportunityFormValues>(BLANK_OPPORTUNITY);

  function openRaise() {
    setReq({
      ...BLANK_OPPORTUNITY,
      clientId: l.clientId ? String(l.clientId) : '',
      prospectId: !l.clientId && l.prospectId && prospects.some((p) => p.id === l.prospectId) ? String(l.prospectId) : '',
      companyName: l.companyName,
      title: l.title,
    });
    setErrors({});
    setBanner(null);
    setRaiseOpen(true);
  }

  const bannerEl = banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>;
  const footer = (onCancel: () => void, onSave: () => void, label: string) => (
    <div className="flex justify-end gap-2 border-t border-line pt-4">
      <button className="btn-ghost" onClick={onCancel}>
        Cancel
      </button>
      <button className="btn-primary" onClick={onSave} disabled={saving}>
        {saving ? 'Saving…' : label}
      </button>
    </div>
  );
  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <dt className="text-2xs font-semibold uppercase tracking-wider text-ink3">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink">{value || '—'}</dd>
    </div>
  );

  return (
    <div className="pb-12">
      <PageHeader
        title={l.title}
        subtitle={l.companyName}
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/lead-records" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Leads
            </Link>
            {access.edit && (
              <button className="btn-ghost" onClick={openEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
            {canHandOff && (
              <button
                className="btn-primary"
                onClick={() => {
                  setSuggested('');
                  setBanner(null);
                  setHandoffOpen(true);
                }}
              >
                <Send className="h-4 w-4" /> Hand to Sales
              </button>
            )}
            {canAssign && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setAssignee(l.salesOwnerUserId ? String(l.salesOwnerUserId) : (l.suggestedSalesUserId ? String(l.suggestedSalesUserId) : ''));
                  setBanner(null);
                  setAssignOpen(true);
                }}
              >
                <UserCheck className="h-4 w-4" /> Assign
              </button>
            )}
            {canRaise && (
              <button className="btn-primary" onClick={openRaise}>
                <Briefcase className="h-4 w-4" /> Raise Requirement
              </button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 px-6 py-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <LeadStatusBadge value={l.status} />
              <TemperatureBadge value={l.temperature} />
            </div>
            <dl className="grid grid-cols-2 gap-3">
              {fact(
                'Company',
                l.prospectId ? (
                  <Link className="hover:underline" href={`/prospects/${l.prospectId}`}>
                    {l.companyName}
                  </Link>
                ) : (
                  <>
                    {l.companyName} <Badge>client</Badge>
                  </>
                ),
              )}
              {fact('Leadgen owner', l.leadOwnerName)}
              {fact('Sales owner', l.salesOwnerName ?? (l.handedOffAt ? 'In the Sales queue' : null))}
              {fact('Suggested', l.suggestedSalesName)}
              {fact('Handed off', l.handedOffAt && formatDate(l.handedOffAt.slice(0, 10)))}
              {fact('Created', formatDate(l.createdAt))}
            </dl>
            <div className="mt-3">
              <div className="text-2xs font-semibold uppercase tracking-wider text-ink3">Qualification</div>
              <div className="mt-1">
                <BantTicks value={l} />
              </div>
            </div>
            {l.summary && <p className="mt-3 whitespace-pre-wrap text-sm text-ink2">{l.summary}</p>}
            {l.status === 'closed_lost' && l.closedReason && (
              <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">Lost: {l.closedReason}</p>
            )}
          </div>

          <div className="card">
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Requirements raised</div>
            {requirements.length === 0 ? (
              <p className="px-4 py-4 text-sm text-ink3">
                {canRaise ? 'None yet — raise one from this lead.' : 'None yet. Sales raises requirements once the lead is with them.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {requirements.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <Link href={`/pipeline/${r.id}`} className="truncate text-ink hover:underline">
                      {r.title}
                    </Link>
                    <Badge>{r.stage.replace(/_/g, ' ')}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Activity</h2>
            {access.log && (
              <LogActivityButton
                prospectId={l.prospectId}
                leadId={l.id}
                stage={null}
                contacts={[]}
                campaigns={campaigns}
                defaultCampaignId={null}
              />
            )}
          </div>
          <ActivityTimeline items={activities} />
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit Lead">
        <div className="space-y-4">
          {bannerEl}
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
          {moves.length > 0 && (
            <Field
              label="Status"
              error={errors.status}
              hint={l.status === 'handed_off' ? 'Back to Open returns the lead to Leadgen and out of the Sales queue.' : undefined}
            >
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="">{LEAD_STATUS_LABELS[l.status as LeadStatus]} (no change)</option>
                {moves.map((s) => (
                  <option key={s} value={s}>
                    {s === 'open' ? (l.status === 'closed_lost' ? 'Reopen' : 'Back to Open (return to Leadgen)') : 'Close as lost'}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {form.status === 'closed_lost' && (
            <Field label="Why was it lost?" required error={errors.closedReason}>
              <input className="input" value={form.closedReason} onChange={(e) => setForm({ ...form, closedReason: e.target.value })} />
            </Field>
          )}
          {footer(
            () => setEditOpen(false),
            () =>
              submit(
                `/api/leadgen/leads/${l.id}`,
                'PUT',
                { ...form, ...bant, status: form.status || undefined },
                () => setEditOpen(false),
              ),
            'Save Changes',
          )}
        </div>
      </Modal>

      <Modal
        open={handoffOpen}
        onClose={() => setHandoffOpen(false)}
        title="Hand to Sales"
        description="The lead joins the Sales queue. A Sales head assigns who takes it; you can suggest someone."
      >
        <div className="space-y-4">
          {bannerEl}
          <div className="text-sm">
            <span className="text-ink2">Qualification: </span>
            <BantTicks value={l} />
          </div>
          <Field label="Suggest a salesperson" error={errors.suggestedSalesUserId}>
            <select className="input" value={suggested} onChange={(e) => setSuggested(e.target.value)}>
              <option value="">No suggestion</option>
              {salesTeam.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {footer(
            () => setHandoffOpen(false),
            () => submit(`/api/leadgen/leads/${l.id}/handoff`, 'POST', { suggestedSalesUserId: suggested }, () => setHandoffOpen(false)),
            'Hand Off',
          )}
        </div>
      </Modal>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Salesperson">
        <div className="space-y-4">
          {bannerEl}
          <Field label="Salesperson" error={errors.salesOwnerUserId}>
            <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Unassigned (back to the queue)</option>
              {salesTeam.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          {footer(
            () => setAssignOpen(false),
            () => submit(`/api/leadgen/leads/${l.id}/assign`, 'POST', { salesOwnerUserId: assignee }, () => setAssignOpen(false)),
            'Assign',
          )}
        </div>
      </Modal>

      <Modal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        title="Raise Requirement"
        description={`From this lead. The requirement takes ${l.companyName} and the lead's owners, whatever the company picker says.`}
        wide
      >
        <div className="space-y-4">
          {bannerEl}
          <OpportunityFormFields form={req} setForm={setReq} errors={errors} clients={clients} prospects={prospects} />
          {footer(
            () => setRaiseOpen(false),
            // Stays on the lead: the new requirement appears in its list.
            () => submit('/api/opportunities', 'POST', { ...toPayload(req, clients, prospects), leadId: l.id }, () => setRaiseOpen(false)),
            'Raise Requirement',
          )}
        </div>
      </Modal>
    </div>
  );
}
