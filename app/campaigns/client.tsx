'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { CAMPAIGN_CHANNEL_LABELS, CAMPAIGN_STATUS_LABELS, type CampaignChannel, type CampaignStatus } from '@/lib/leadgen-rules';
import type { CampaignListRow } from '@/lib/leadgen';
import { Badge, EmptyState, PageHeader, TableShell, type Tone } from '@/components/ui';
import CampaignModal, { BLANK_CAMPAIGN } from '@/components/campaign-form';

export const STATUS_TONE: Record<CampaignStatus, Tone> = { planned: 'neutral', active: 'green', closed: 'violet' };

/** Null conversion — nobody reached yet — reads as a dash, not 0%. */
export const pct = (v: number | null) => (v === null ? '—' : `${v}%`);

export default function CampaignsClient({
  initial,
  owners,
  canCreate,
  canSetOwner,
}: {
  initial: CampaignListRow[];
  owners: { id: number; name: string }[];
  canCreate: boolean;
  canSetOwner: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pb-12">
      <PageHeader
        title="Campaigns"
        subtitle="Outreach pushes and what they produced"
        action={
          canCreate && (
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Campaign
            </button>
          )
        }
      />
      <div className="px-6 py-4">
        <div className="card overflow-hidden">
          {initial.length === 0 ? (
            <EmptyState icon={Megaphone} title="No campaigns yet" description="Group outreach under a campaign to see what it produced." />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Campaign</th>
                  <th className="th">Channel</th>
                  <th className="th">Dates</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Prospects</th>
                  <th className="th text-right">Reached</th>
                  <th className="th text-right">Responded</th>
                  <th className="th text-right">Meetings</th>
                  <th className="th text-right">Leads</th>
                  <th className="th text-right">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {initial.map((c) => (
                  <tr key={c.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-ink hover:underline">
                        {c.name}
                      </Link>
                      <div className="text-xs text-ink3">
                        {[c.segment, c.ownerName].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="td">{CAMPAIGN_CHANNEL_LABELS[c.channel as CampaignChannel]}</td>
                    <td className="td tnum text-xs">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)}
                    </td>
                    <td className="td">
                      <Badge tone={STATUS_TONE[c.status as CampaignStatus]}>{CAMPAIGN_STATUS_LABELS[c.status as CampaignStatus]}</Badge>
                    </td>
                    <td className="td tnum text-right">{c.results.prospects}</td>
                    <td className="td tnum text-right">{c.results.reached}</td>
                    <td className="td tnum text-right">{c.results.responded}</td>
                    <td className="td tnum text-right">{c.results.meetings}</td>
                    <td className="td tnum text-right">{c.results.leads}</td>
                    <td className="td tnum text-right">{pct(c.results.conversionPct)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>
      <CampaignModal open={open} onClose={() => setOpen(false)} initial={BLANK_CAMPAIGN} owners={owners} canSetOwner={canSetOwner} />
    </div>
  );
}
