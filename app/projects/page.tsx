import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, deployments } from '@/lib/schema';
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
        headcount: sql<number>`count(distinct ${deployments.resourceId})`,
        billing: sql<number>`coalesce(sum(case when ${deployments.deploymentType} = 'billable' then ${deployments.billingAmount} else 0 end), 0)`,
      })
      .from(deployments)
      .where(eq(deployments.status, 'active'))
      .groupBy(deployments.projectId)
      .all(),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
  ]);

  const initial = rows.map((p) => {
    const s = stats.find((x) => x.projectId === p.id);
    return { ...p, headcount: s?.headcount ?? 0, monthlyBilling: s?.billing ?? 0 };
  });

  return <ProjectsClient initial={initial} clients={clientOptions} />;
}
