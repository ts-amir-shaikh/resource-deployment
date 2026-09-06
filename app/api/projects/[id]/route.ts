import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projects,
  clients,
  deployments,
  resources,
  agreements,
  invoices,
} from '@/lib/schema';
import { projectSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid project id', 400);

    const row = await db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        projectName: projects.projectName,
        managerName: projects.managerName,
        managerEmail: projects.managerEmail,
        managerMobile: projects.managerMobile,
        managerDesignation: projects.managerDesignation,
        createdAt: projects.createdAt,
        clientName: clients.companyName,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, id))
      .get();

    if (!row) return fail('Project not found', 404);

    const deployed = await db
      .select({
        id: deployments.id,
        resourceId: deployments.resourceId,
        resourceName: resources.name,
        designation: resources.designation,
        deploymentType: deployments.deploymentType,
        allocationPercentage: deployments.allocationPercentage,
        startDate: deployments.startDate,
        endDate: deployments.endDate,
        billingAmount: deployments.billingAmount,
        status: deployments.status,
      })
      .from(deployments)
      .innerJoin(resources, eq(deployments.resourceId, resources.id))
      .where(eq(deployments.projectId, id))
      .orderBy(deployments.status, resources.name)
      .all();

    const linkedAgreements = await db
      .select()
      .from(agreements)
      .where(eq(agreements.projectId, id))
      .orderBy(agreements.renewalVersion)
      .all();

    const linkedInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, id))
      .orderBy(invoices.periodFrom)
      .all();

    return ok({
      ...row,
      deployments: deployed,
      agreements: linkedAgreements,
      invoices: linkedInvoices,
    });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid project id', 400);

    const existing = await db.select().from(projects).where(eq(projects.id, id)).get();
    if (!existing) return fail('Project not found', 404);

    const { data, error } = await parseBody(req, projectSchema);
    if (error) return error;

    const row = await db.update(projects).set(data).where(eq(projects.id, id)).returning().get();
    return ok(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid project id', 400);

    const active = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(and(eq(deployments.projectId, id), eq(deployments.status, 'active')))
      .all();
    if (active.length) {
      return fail(
        `This project has ${active.length} active deployment${active.length > 1 ? 's' : ''}. End them before deleting.`,
        409,
      );
    }

    const hasAgreements = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(eq(agreements.projectId, id))
      .get();
    if (hasAgreements) {
      return fail('This project has agreements linked to it and cannot be deleted.', 409);
    }

    const hasInvoices = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.projectId, id))
      .get();
    if (hasInvoices) {
      return fail('This project has invoices linked to it and cannot be deleted.', 409);
    }

    const hasHistory = await db
      .select({ id: deployments.id })
      .from(deployments)
      .where(eq(deployments.projectId, id))
      .get();
    if (hasHistory) {
      return fail('This project has deployment history and cannot be deleted.', 409);
    }

    await db.delete(projects).where(eq(projects.id, id)).run();
    return ok({ deleted: id });
  });
}
