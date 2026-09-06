import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources, deployments, projects, clients, candidates } from '@/lib/schema';
import { resourceSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getResourceAllocation } from '@/lib/queries';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);

    const row = await db.select().from(resources).where(eq(resources.id, id)).get();
    if (!row) return fail('Resource not found', 404);

    const history = await db
      .select({
        id: deployments.id,
        projectId: deployments.projectId,
        projectName: projects.projectName,
        clientName: clients.companyName,
        deploymentType: deployments.deploymentType,
        allocationPercentage: deployments.allocationPercentage,
        startDate: deployments.startDate,
        endDate: deployments.endDate,
        billingAmount: deployments.billingAmount,
        status: deployments.status,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(deployments.resourceId, id))
      .orderBy(deployments.startDate)
      .all();

    return ok({ ...row, allocation: await getResourceAllocation(id), deployments: history });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);

    const existing = await db.select().from(resources).where(eq(resources.id, id)).get();
    if (!existing) return fail('Resource not found', 404);

    const { data, error } = await parseBody(req, resourceSchema);
    if (error) return error;

    const row = await db
      .update(resources)
      .set({
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        designation: data.designation,
        currentCtc: data.currentCtc,
        revisedCtc: data.revisedCtc,
        revisedEffectiveFrom: data.revisedEffectiveFrom,
        primarySkill: data.primarySkill,
        secondarySkill: data.secondarySkill,
        otherSkills: JSON.stringify(data.otherSkills ?? []),
      })
      .where(eq(resources.id, id))
      .returning()
      .get();

    return ok(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);

    const active = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(eq(deployments.resourceId, id), eq(deployments.status, 'active')))
      .all();

    if (active.length) {
      return fail(
        `This resource has ${active.length} active deployment${active.length > 1 ? 's' : ''}. End them before deleting.`,
        409,
      );
    }

    const anyDeployment = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(eq(deployments.resourceId, id))
      .get();

    if (anyDeployment) {
      return fail(
        'This resource has deployment history and cannot be deleted. Its records are referenced by billing data.',
        409,
      );
    }

    // M9 impact: an in-house candidate row may point at this resource.
    const linkedCandidate = await db
      .select({ id: candidates.id, name: candidates.name })
      .from(candidates)
      .where(eq(candidates.resourceId, id))
      .get();

    if (linkedCandidate) {
      return fail(
        'This resource is linked to a candidate profile in the pipeline. Unlink or delete that candidate first.',
        409,
      );
    }

    await db.delete(resources).where(eq(resources.id, id)).run();
    return ok({ deleted: id });
  });
}
