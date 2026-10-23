import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deployments, resources, projects, clients, agreements, timesheetEntries } from '@/lib/schema';
import { deploymentSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import {
  assertAllocationHeadroom,
  deploymentBilling,
  getResourceAllocation,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid deployment id', 400);

    const row = await db
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
      .where(eq(deployments.id, id))
      .get();

    if (!row) return fail('Deployment not found', 404);

    return ok({
      ...row,
      billing: deploymentBilling(row),
      resourceAllocation: await getResourceAllocation(row.resourceId),
    });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid deployment id', 400);

    const existing = await db.select().from(deployments).where(eq(deployments.id, id)).get();
    if (!existing) return fail('Deployment not found', 404);

    const { data, error } = await parseBody(req, deploymentSchema);
    if (error) return error;

    if (data.agreementId) {
      const agreement = await db
        .select({ id: agreements.id, projectId: agreements.projectId, currency: agreements.currency })
        .from(agreements)
        .where(eq(agreements.id, data.agreementId))
        .get();
      if (!agreement) return fail('Selected agreement no longer exists', 422);
      if (agreement.projectId !== data.projectId) {
        return fail('That agreement belongs to a different project', 422, {
          fields: { agreementId: 'Pick an agreement raised against the selected project' },
        });
      }
      // A PO is signed in one currency; anything billed under it is denominated
      // in that currency. The form locks the picker, so a mismatch here means a
      // hand-made request or a stale page.
      if (agreement.currency !== data.currency) {
        return fail(
          `This agreement is in ${agreement.currency}; the deployment must use the same currency.`,
          422,
          { fields: { currency: `Must be ${agreement.currency}` } },
        );
      }
    }

    // Re-check headroom excluding this record, so its own allocation does not
    // count against itself.
    if (existing.status === 'active') {
      await assertAllocationHeadroom(data.resourceId, data.allocationPercentage, id);
    }

    const row = await db
      .update(deployments)
      .set({
        resourceId: data.resourceId,
        projectId: data.projectId,
        agreementId: data.agreementId ?? null,
        currency: data.currency,
        deploymentType: data.deploymentType,
        allocationPercentage: data.allocationPercentage,
        // Left alone when the request does not carry it (a CSV or older form).
        ...(data.fullDayHours !== undefined ? { fullDayHours: data.fullDayHours } : {}),
        startDate: data.startDate,
        endDate: data.endDate,
        billingAmount: data.billingAmount,
        commissionAmount: data.commissionAmount,
        operationsOverhead: data.operationsOverhead,
        gstApplicable: data.gstApplicable,
      })
      .where(eq(deployments.id, id))
      .returning()
      .get();

    // D18: changing the hours a day re-values days already approved, because
    // days are derived from hours (BR-TSH-08). That is allowed — it warns, it
    // does not lock — so the caller is told how many approved entries it touches.
    let warning: string | null = null;
    if (data.fullDayHours !== undefined && data.fullDayHours !== existing.fullDayHours) {
      const approved = await db
        .select({ n: count() })
        .from(timesheetEntries)
        .where(and(eq(timesheetEntries.deploymentId, id), eq(timesheetEntries.status, 'approved')))
        .get();
      if (approved && approved.n > 0) {
        warning = `Hours a day changed from ${existing.fullDayHours} to ${data.fullDayHours}. ${approved.n} approved timesheet ${approved.n === 1 ? 'entry is' : 'entries are'} on this deployment, so the days they are worth will be recalculated, including for invoices not yet raised.`;
      }
    }

    return ok({ ...row, warning });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid deployment id', 400);

    const existing = await db.select().from(deployments).where(eq(deployments.id, id)).get();
    if (!existing) return fail('Deployment not found', 404);

    await db.delete(deployments).where(eq(deployments.id, id)).run();
    return ok({ deleted: id });
  });
}
