import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deployments, resources, projects, clients } from '@/lib/schema';
import { getResourceUtilisation } from '@/lib/queries';
import DeploymentsClient from './client';

export const dynamic = 'force-dynamic';

export default async function DeploymentsPage() {
  // Independent of each other — run concurrently.
  const [rows, resourceOptions, projectOptions] = await Promise.all([
    db
      .select({
        id: deployments.id,
        resourceId: deployments.resourceId,
        projectId: deployments.projectId,
        resourceName: resources.name,
        designation: resources.designation,
        projectName: projects.projectName,
        clientName: clients.companyName,
        deploymentType: deployments.deploymentType,
        allocationPercentage: deployments.allocationPercentage,
        startDate: deployments.startDate,
        endDate: deployments.endDate,
        billingAmount: deployments.billingAmount,
        commissionAmount: deployments.commissionAmount,
        gstApplicable: deployments.gstApplicable,
        status: deployments.status,
      })
      .from(deployments)
      .innerJoin(resources, eq(deployments.resourceId, resources.id))
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(desc(deployments.status), desc(deployments.startDate))
      .all(),
    getResourceUtilisation(),
    db
      .select({
        id: projects.id,
        projectName: projects.projectName,
        clientName: clients.companyName,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(clients.companyName, projects.projectName)
      .all(),
  ]);

  return (
    <DeploymentsClient
      initial={rows}
      resources={resourceOptions}
      projects={projectOptions}
    />
  );
}
