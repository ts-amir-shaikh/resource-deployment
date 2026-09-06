import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deployments, resources, projects, clients } from '@/lib/schema';
import { deploymentSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';
import { assertAllocationHeadroom, deploymentBilling } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const type = searchParams.get('type');
    const resourceId = searchParams.get('resource_id');
    const projectId = searchParams.get('project_id');

    const filters = [];
    if (status === 'active' || status === 'ended') {
      filters.push(eq(deployments.status, status));
    }
    if (type === 'billable' || type === 'shadow') {
      filters.push(eq(deployments.deploymentType, type));
    }
    if (resourceId) filters.push(eq(deployments.resourceId, Number(resourceId)));
    if (projectId) filters.push(eq(deployments.projectId, Number(projectId)));

    const rows = await db
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
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(deployments.status), desc(deployments.startDate))
      .all();

    return ok(rows.map((r) => ({ ...r, billing: deploymentBilling(r) })));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, deploymentSchema);
    if (error) return error;

    const resource = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.id, data.resourceId))
      .get();
    if (!resource) return fail('Selected resource no longer exists', 422);

    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .get();
    if (!project) return fail('Selected project no longer exists', 422);

    // Guard: a resource cannot exceed 100% across active deployments.
    // Throws AllocationError -> 409 with headroom, handled in `handle`.
    await assertAllocationHeadroom(data.resourceId, data.allocationPercentage);

    const row = await db
      .insert(deployments)
      .values({
        resourceId: data.resourceId,
        projectId: data.projectId,
        deploymentType: data.deploymentType,
        allocationPercentage: data.allocationPercentage,
        startDate: data.startDate,
        endDate: data.endDate,
        billingAmount: data.billingAmount,
        commissionAmount: data.commissionAmount,
        gstApplicable: data.gstApplicable,
        status: 'active',
      })
      .returning()
      .get();

    return ok(row, 201);
  });
}
