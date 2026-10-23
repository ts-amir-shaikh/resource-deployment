'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, LayoutGrid, List, Plus, Search } from 'lucide-react';
import { api, errorMessage, isApiError } from '@/lib/client';
import { formatDate, today } from '@/lib/utils';
import {
  BOARD_STAGES,
  PROSPECT_STAGE_LABELS,
  TEMPERATURES,
  TEMPERATURE_LABELS,
} from '@/lib/leadgen-rules';
import type { ProspectListRow } from '@/lib/leadgen';
import { EmptyState, Modal, PageHeader, TableShell } from '@/components/ui';
import {
  DuplicateWarning,
  FollowUpsPanel,
  StageBadge,
  TemperatureBadge,
  duplicatesOf,
  type DuplicateHit,
  type FollowUp,
} from '@/components/leadgen-ui';
import ProspectFormFields, { BLANK_PROSPECT, prospectPayload, type Option } from '@/components/prospect-form';

export default function ProspectsClient({
  initial,
  campaigns,
  owners,
  followUps,
  canCreate,
  canSetOwner,
}: {
  initial: ProspectListRow[];
  campaigns: Option[];
  owners: Option[];
  followUps: FollowUp[] | null;
  canCreate: boolean;
  canSetOwner: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [temperature, setTemperature] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [campaignId, setCampaignId] = useState('');

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK_PROSPECT);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return initial.filter(
      (p) =>
        (!q || p.companyName.toLowerCase().includes(q) || (p.primaryContact ?? '').toLowerCase().includes(q)) &&
        (!stage || p.stage === stage) &&
        (!temperature || p.temperature === temperature) &&
        (!ownerId || String(p.ownerUserId ?? '') === ownerId) &&
        (!campaignId || String(p.campaignId ?? '') === campaignId),
    );
  }, [initial, search, stage, temperature, ownerId, campaignId]);

  function openCreate() {
    setForm(BLANK_PROSPECT);
    setErrors({});
    setBanner(null);
    setDuplicates([]);
    setOpen(true);
  }

  async function save(confirmDuplicate = false) {
    setSaving(true);
    setErrors({});
    setBanner(null);
    setDuplicates([]);
    try {
      const row = await api<{ id: number }>('/api/leadgen/prospects', {
        method: 'POST',
        json: prospectPayload(form, confirmDuplicate),
      });
      setOpen(false);
      router.push(`/prospects/${row.id}`);
    } catch (e) {
      if (isApiError(e) && e.fields) setErrors(e.fields);
      const hits = duplicatesOf(e);
      if (hits.length) setDuplicates(hits);
      else setBanner(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const due = (d: string | null) => d !== null && d <= today();

  return (
    <div className="pb-12">
      <PageHeader
        title="Prospects"
        subtitle="Companies we are working before they become leads"
        action={
          canCreate && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add Prospect
            </button>
          )
        }
      />

      {followUps && followUps.length > 0 && (
        <div className="px-6 pt-4">
          <FollowUpsPanel items={followUps} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink3" />
          <input
            className="input w-56 pl-8"
            placeholder="Search company or contact"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {view === 'list' && (
          <select className="input w-40" value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Stage">
            <option value="">All stages</option>
            {BOARD_STAGES.map((s) => (
              <option key={s} value={s}>
                {PROSPECT_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <select className="input w-36" value={temperature} onChange={(e) => setTemperature(e.target.value)} aria-label="Temperature">
          <option value="">Any temperature</option>
          {TEMPERATURES.map((t) => (
            <option key={t} value={t}>
              {TEMPERATURE_LABELS[t]}
            </option>
          ))}
        </select>
        {owners.length > 1 && (
          <select className="input w-40" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Owner">
            <option value="">Any owner</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
        <select className="input w-44" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign">
          <option value="">Any campaign</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="ml-auto flex rounded-md border border-line">
          <button
            className={`px-2.5 py-1.5 ${view === 'board' ? 'bg-surface2 text-ink' : 'text-ink3'}`}
            onClick={() => setView('board')}
            aria-label="Board view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            className={`px-2.5 py-1.5 ${view === 'list' ? 'bg-surface2 text-ink' : 'text-ink3'}`}
            onClick={() => setView('list')}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {initial.length === 0 ? (
        <div className="px-6 py-4">
          <div className="card">
            <EmptyState
              icon={Building2}
              title="No prospects yet"
              description={canCreate ? 'Add the companies you are reaching out to.' : 'Nothing to show.'}
            />
          </div>
        </div>
      ) : view === 'board' ? (
        // D12: the columns are stages; temperature is the marker on each card.
        <div className="flex gap-3 overflow-x-auto px-6 py-4">
          {BOARD_STAGES.map((s) => {
            const col = rows.filter((p) => p.stage === s);
            return (
              <div key={s} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink3">
                  <span>{PROSPECT_STAGE_LABELS[s]}</span>
                  <span className="tnum">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((p) => (
                    <Link key={p.id} href={`/prospects/${p.id}`} className="card block p-3 hover:border-brand/40">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium text-ink">{p.companyName}</span>
                        <TemperatureBadge value={p.temperature} />
                      </div>
                      <div className="mt-1 space-y-0.5 text-xs text-ink3">
                        {p.primaryContact && <div>{p.primaryContact}</div>}
                        {p.ownerName && <div>Owner: {p.ownerName}</div>}
                        {p.nextFollowUp && (
                          <div className={due(p.nextFollowUp) ? 'text-rose-600 dark:text-rose-400' : ''}>
                            Follow up {formatDate(p.nextFollowUp)}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-6 py-4">
          <div className="card overflow-hidden">
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Company</th>
                  <th className="th">Stage</th>
                  <th className="th">Temperature</th>
                  <th className="th">Owner</th>
                  <th className="th">Campaign</th>
                  <th className="th">Last activity</th>
                  <th className="th">Follow up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <Link href={`/prospects/${p.id}`} className="font-medium text-ink hover:underline">
                        {p.companyName}
                      </Link>
                      {p.primaryContact && <div className="text-xs text-ink3">{p.primaryContact}</div>}
                    </td>
                    <td className="td">
                      <StageBadge value={p.stage} />
                    </td>
                    <td className="td">
                      <TemperatureBadge value={p.temperature} />
                    </td>
                    <td className="td">{p.ownerName ?? '—'}</td>
                    <td className="td">{p.campaignName ?? '—'}</td>
                    <td className="td tnum">{formatDate(p.lastActivity)}</td>
                    <td className={`td tnum ${due(p.nextFollowUp) ? 'text-rose-600 dark:text-rose-400' : ''}`}>
                      {formatDate(p.nextFollowUp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add Prospect" wide>
        <div className="space-y-4">
          {banner && <p className="text-sm text-rose-600 dark:text-rose-400">{banner}</p>}
          <ProspectFormFields
            form={form}
            setForm={setForm}
            errors={errors}
            campaigns={campaigns}
            owners={owners}
            canSetOwner={canSetOwner}
            creating
          />
          <DuplicateWarning hits={duplicates} onConfirm={() => save(true)} />
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => save()} disabled={saving}>
              {saving ? 'Saving…' : 'Add Prospect'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
