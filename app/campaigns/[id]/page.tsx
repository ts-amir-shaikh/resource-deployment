import { notFound } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { parseId } from '@/lib/api';
import { getCampaignDetail, teamOptions } from '@/lib/leadgen';
import CampaignDetailClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Campaign · Resource Deployment' };

/** One campaign: its results (G-LED-07) and the prospects in it that this viewer may open. */
export default async function CampaignPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const id = parseId(params.id);
  const detail = id ? await getCampaignDetail(viewer, id) : null;
  if (!detail) notFound();
  const owners = await teamOptions('leadgen');
  return (
    <CampaignDetailClient
      detail={detail}
      owners={owners.map((o) => ({ id: o.id, name: o.name }))}
      canSetOwner={viewer.role === 'admin' || (viewer.role === 'leadgen' && viewer.isTeamLead)}
    />
  );
}
