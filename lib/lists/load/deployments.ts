import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deployments, resources, projects, clients, agreements } from '@/lib/schema';

/** Every deployment, active first, with its resource, project, client and PO. */
export async function loadDeployments() {
  return db
    .select({
      id: deployments.id,
      resourceId: deployments.resourceId,
      projectId: deployments.projectId,
      agreementId: deployments.agreementId,
      resourceName: resources.name,
      designation: resources.designation,
      projectName: projects.projectName,
      clientName: clients.companyName,
      agreementNumber: agreements.agreementNumber,
      agreementTitle: agreements.title,
      deploymentType: deployments.deploymentType,
      allocationPercentage: deployments.allocationPercentage,
      fullDayHours: deployments.fullDayHours,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      currency: deployments.currency,
      billingAmount: deployments.billingAmount,
      commissionAmount: deployments.commissionAmount,
      operationsOverhead: deployments.operationsOverhead,
      gstApplicable: deployments.gstApplicable,
      status: deployments.status,
    })
    .from(deployments)
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(agreements, eq(deployments.agreementId, agreements.id))
    .orderBy(desc(deployments.status), desc(deployments.startDate))
    .all();
}

export type DeploymentRow = Awaited<ReturnType<typeof loadDeployments>>[number];
