import { getViewer } from '@/lib/session';
import { clientOptions, listLeads } from '@/lib/leadgen';
import LeadRecordsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Leads · Resource Deployment' };

/**
 * M66 (D4): lead records. Not /leads, which stays "My Leads", the Leadgen
 * board of requirements (Q1). Leadgen sees its own; Sales those handed over.
 */
export default async function LeadRecordsPage() {
  const viewer = await getViewer();
  const canCreate = viewer.role === 'admin' || viewer.role === 'leadgen';
  const [rows, clients] = await Promise.all([listLeads(viewer), canCreate ? clientOptions() : Promise.resolve([])]);
  return <LeadRecordsClient initial={rows} clients={clients} canCreate={canCreate} />;
}
