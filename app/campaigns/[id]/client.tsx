'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUS_LABELS, type CampaignChannel, type CampaignStatus } from '@/lib/leadgen-rules';
import type { getCampaignDetail } from '@/lib/leadgen';
import { Badge, KpiCard, PageHeader, TableShell } from '@/components/ui';
import { StageBadge, TemperatureBadge } from '@/components/leadgen-ui';
import CampaignModal, { type CampaignValues } from '@/components/campaign-form';
import { STATUS_TONE, pct } from '../client';

type Detail = NonNullable<Awaited<ReturnType<typeof getCampaignDetail>>>;

export default function CampaignDetailClient({
  detail,
  owners,
  canSetOwner,
}: {
  detail: Detail;
  owners: { id: number; name: string }[];
  canSetOwner: boolean;
}) {
  const { campaign: c, results: r, prospects, access } = detail;
  const [open, setOpen] = useState(false);
  const initial = useMemo<CampaignValues>(
    () => ({
      id: c.id,
      name: c.name,
      segment: c.segment ?? '',
      channel: c.channel,
      startDate: c.startDate ?? '',
      endDate: c.endDate ?? '',
      status: c.status,
      ownerUserId: c.ownerUserId ? String(c.ownerUserId) : '',
      notes: c.notes ?? '',
    }),
    [c],
  );

  return (
    <div className="pb-12">
      <PageHeader
        title={c.name}
        subtitle={[c.segment, CAMPAIGN_CHANNEL_LABELS[c.channel as CampaignChannel], c.ownerName].filter(Boolean).join(' · ')}
        action={
          <div className="flex gap-2">
            <Link href="/campaigns" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> Campaigns
            </Link>
            {access.edit && (
              <button className="btn-ghost" onClick={() => setOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit
              </button>
            )}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4 text-sm text-ink2">
        <Badge tone={STATUS_TONE[c.status as CampaignStatus]}>{CAMPAIGN_STATUS_LABELS[c.status as CampaignStatus]}</Badge>
        <span className="tnum">
          {formatDate(c.startDate)} – {formatDate(c.endDate)}
        </span>
      </div>
      {/* G-LED-07, computed on read (KTD3). */}
      <div className="grid grid-cols-2 gap-3 px-6 pt-4 lg:grid-cols-6">
        <KpiCard label="Prospects" value={String(r.prospects)} info="Prospects linked to this campaign." />
        <KpiCard label="Reached" value={String(r.reached)} info="Prospects with at least one logged activity." />
        <KpiCard label="Responded" value={String(r.responded)} info="Prospects with an outcome other than no answer or not interested." />
        <KpiCard label="Meetings" value={String(r.meetings)} info="Meeting activities logged on the campaign's prospects." />
        <KpiCard label="Leads" value={String(r.leads)} info="Prospects converted to a lead." />
        <KpiCard label="Conversion" value={pct(r.conversionPct)} info="Leads divided by prospects reached. A dash until someone is reached." />
      </div>
      {c.notes && <p className="whitespace-pre-wrap px-6 pt-4 text-sm text-ink2">{c.notes}</p>}
      <div className="px-6 py-4">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Prospects</div>
          {prospects.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink3">No prospects you can open are linked to this campaign.</p>
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Company</th>
                  <th className="th">Stage</th>
                  <th className="th">Temperature</th>
                  <th className="th">Owner</th>
                  <th className="th">Last activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {prospects.map((p) => (
                  <tr key={p.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <Link href={`/prospects/${p.id}`} className="font-medium text-ink hover:underline">
                        {p.companyName}
                      </Link>
                    </td>
                    <td className="td">
                      <StageBadge value={p.stage} />
                    </td>
                    <td className="td">
                      <TemperatureBadge value={p.temperature} />
                    </td>
                    <td className="td">{p.ownerName ?? '—'}</td>
                    <td className="td tnum">{formatDate(p.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>
      <CampaignModal open={open} onClose={() => setOpen(false)} initial={initial} owners={owners} canSetOwner={canSetOwner} />
    </div>
  );
}
