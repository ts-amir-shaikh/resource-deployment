import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, projects, deployments } from '@/lib/schema';
import ClientsClient from './client';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const rows = await db.select().from(clients).orderBy(desc(clients.id)).all();

  const counts = await db
    .select({ clientId: projects.clientId, count: sql<number>`count(*)` })
    .from(projects)
    .groupBy(projects.clientId)
    .all();

  const billing = await db
    .select({
      clientId: projects.clientId,
      total: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
    })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(and(eq(deployments.status, 'active'), eq(deployments.deploymentType, 'billable')))
    .groupBy(projects.clientId)
    .all();

  const initial = rows.map((c) => ({
    ...c,
    projectCount: counts.find((p) => p.clientId === c.id)?.count ?? 0,
    monthlyBilling: billing.find((b) => b.clientId === c.id)?.total ?? 0,
  }));

  return <ClientsClient initial={initial} />;
}
