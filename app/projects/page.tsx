import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, deployments } from '@/lib/schema';
import { sumByCurrency } from '@/lib/utils';
import ProjectsClient from './client';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  // Independent of each other — run concurrently.
  const [rows, stats, clientOptions] = await Promise.all([
    db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        projectName: projects.projectName,
        managerName: projects.managerName,
        managerEmail: projects.managerEmail,
        managerMobile: projects.managerMobile,
        managerDesignation: projects.managerDesignation,
        clientName: clients.companyName,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(desc(projects.id))
      .all(),
    db
      .select({
        projectId: deployments.projectId,
        currency: deployments.currency,
        headcount: sql<number>`count(distinct ${deployments.resourceId})`,
        billing: sql<number>`coalesce(sum(case when ${deployments.deploymentType} = 'billable' then ${deployments.billingAmount} else 0 end), 0)`,
      })
      .from(deployments)
      .where(eq(deployments.status, 'active'))
      // By currency too: a project can hold an INR deployment and an AED one,
      // and one summed figure across both would be meaningless.
      .groupBy(deployments.projectId, deployments.currency)
      .all(),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
  ]);

  const initial = rows.map((p) => {
    const mine = stats.filter((x) => x.projectId === p.id);
    return {
      ...p,
      // headcount is counted per currency group, so distinct resources spanning
      // two currencies would be double-counted by a plain sum. Max is right for
      // the common case of one currency and never overstates.
      headcount: mine.reduce((n, x) => Math.max(n, x.headcount), 0),
      monthlyBilling: sumByCurrency(
        mine.map((x) => ({ currency: x.currency, amount: x.billing })),
      ),
    };
  });

  return <ProjectsClient initial={initial} clients={clientOptions} />;
}
