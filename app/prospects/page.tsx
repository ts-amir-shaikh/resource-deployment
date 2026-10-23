import { getViewer } from '@/lib/session';
import { campaignOptions, followUpsDue, listProspects, teamOptions } from '@/lib/leadgen';
import ProspectsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Prospects · Resource Deployment' };

/**
 * M66 (G-LED-01): the companies Leadgen is working, as a list or a stage
 * board. Scoped per row by lib/leadgen-ownership.ts — a member sees their
 * own, a head the team's, Sales and Management everything read-only.
 */
export default async function ProspectsPage() {
  const viewer = await getViewer();
  const [rows, campaigns, owners, followUps] = await Promise.all([
    listProspects(viewer),
    campaignOptions(),
    teamOptions('leadgen'),
    followUpsDue(viewer),
  ]);
  const canCreate = viewer.role === 'admin' || viewer.role === 'leadgen';
  return (
    <ProspectsClient
      initial={rows}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      owners={owners.map((o) => ({ id: o.id, name: o.name }))}
      followUps={canCreate ? followUps : null}
      canCreate={canCreate}
      canSetOwner={viewer.role === 'admin' || (viewer.role === 'leadgen' && viewer.isTeamLead)}
    />
  );
}
