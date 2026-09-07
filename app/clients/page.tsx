import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sumByCurrency } from '@/lib/utils';
import { clients, projects, deployments } from '@/lib/schema';
import ClientsClient from './client';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  // Independent of each other — run concurrently.
  const [rows, counts, billing] = await Promise.all([
    db.select().from(clients).orderBy(desc(clients.id)).all(),
    db
      .select({ clientId: projects.clientId, count: sql<number>`count(*)` })
      .from(projects)
      .groupBy(projects.clientId)
      .all(),
    db
      .select({
        clientId: projects.clientId,
        currency: deployments.currency,
        total: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .where(
        and(eq(deployments.status, 'active'), eq(deployments.deploymentType, 'billable')),
      )
      .groupBy(projects.clientId, deployments.currency)
      .all(),
  ]);

  const initial = rows.map((c) => ({
    ...c,
    projectCount: counts.find((p) => p.clientId === c.id)?.count ?? 0,
    monthlyBilling: sumByCurrency(
      billing
        .filter((b) => b.clientId === c.id)
        .map((b) => ({ currency: b.currency, amount: b.total })),
    ),
  }));

  return <ClientsClient initial={initial} />;
}
