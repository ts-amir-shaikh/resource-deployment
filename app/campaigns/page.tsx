import { getViewer } from '@/lib/session';
import { listCampaigns, teamOptions } from '@/lib/leadgen';
import CampaignsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Campaigns · Resource Deployment' };

/** M66 (G-LED-03, G-LED-07): every campaign, with its results computed on read. */
export default async function CampaignsPage() {
  const viewer = await getViewer();
  const [rows, owners] = await Promise.all([listCampaigns(), teamOptions('leadgen')]);
  return (
    <CampaignsClient
      initial={rows}
      owners={owners.map((o) => ({ id: o.id, name: o.name }))}
      canCreate={viewer.role === 'admin' || viewer.role === 'leadgen'}
      canSetOwner={viewer.role === 'admin' || (viewer.role === 'leadgen' && viewer.isTeamLead)}
    />
  );
}
