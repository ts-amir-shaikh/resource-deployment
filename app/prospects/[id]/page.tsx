import { notFound } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { parseId } from '@/lib/api';
import { campaignOptions, getProspectDetail, teamOptions } from '@/lib/leadgen';
import ProspectDetailClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Prospect · Resource Deployment' };

/** One prospect: details, contacts, the activity timeline, and conversion to a lead (D4). */
export default async function ProspectPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const id = parseId(params.id);
  // Out of reach reads as missing (AE6), the same as the API's 404.
  const detail = id ? await getProspectDetail(viewer, id) : null;
  if (!detail) notFound();
  const [campaigns, owners] = await Promise.all([campaignOptions(), teamOptions('leadgen')]);
  return (
    <ProspectDetailClient
      detail={detail}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      owners={owners.map((o) => ({ id: o.id, name: o.name }))}
      canSetOwner={viewer.role === 'admin' || (viewer.role === 'leadgen' && viewer.isTeamLead)}
    />
  );
}
