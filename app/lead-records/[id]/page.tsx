import { notFound } from 'next/navigation';
import { isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, prospects } from '@/lib/schema';
import { getViewer } from '@/lib/session';
import { parseId } from '@/lib/api';
import { campaignOptions, getLeadDetail, teamOptions } from '@/lib/leadgen';
import LeadDetailClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Lead · Resource Deployment' };

/** One lead: BANT, handoff and assignment (Q2), its activity, and the requirements raised from it (R5). */
export default async function LeadPage({ params }: { params: { id: string } }) {
  const viewer = await getViewer();
  const id = parseId(params.id);
  const detail = id ? await getLeadDetail(viewer, id) : null;
  if (!detail) notFound();
  // The requirement form's company picker, as /pipeline loads it.
  const [salesTeam, campaigns, clientRows, prospectRows] = await Promise.all([
    teamOptions('sales'),
    campaignOptions(),
    detail.canRaise ? db.select({ id: clients.id, companyName: clients.companyName }).from(clients).orderBy(clients.companyName).all() : [],
    detail.canRaise
      ? db
          .select({ id: prospects.id, companyName: prospects.companyName })
          .from(prospects)
          .where(isNull(prospects.convertedClientId))
          .orderBy(prospects.companyName)
          .all()
      : [],
  ]);
  return (
    <LeadDetailClient
      detail={detail}
      salesTeam={salesTeam.map((u) => ({ id: u.id, name: u.name }))}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      clients={clientRows}
      prospects={prospectRows}
    />
  );
}
