import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, agreementResources, projects, clients, invoices } from '@/lib/schema';
import { agreementEditSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getAgreementChain, getAgreementResources } from '@/lib/queries';
import { daysUntil } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid agreement id', 400);

    const row = await db
      .select({
        id: agreements.id,
        projectId: agreements.projectId,
        parentAgreementId: agreements.parentAgreementId,
        agreementNumber: agreements.agreementNumber,
        title: agreements.title,
        scope: agreements.scope,
        value: agreements.value,
        startDate: agreements.startDate,
        endDate: agreements.endDate,
        renewalVersion: agreements.renewalVersion,
        status: agreements.status,
        notes: agreements.notes,
        projectName: projects.projectName,
        clientName: clients.companyName,
      })
      .from(agreements)
      .innerJoin(projects, eq(agreements.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(agreements.id, id))
      .get();

    if (!row) return fail('Agreement not found', 404);

    const linkedInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.agreementId, id))
      .orderBy(invoices.periodFrom)
      .all();

    return ok({
      ...row,
      daysToExpiry: row.status === 'active' ? daysUntil(row.endDate) : null,
      resources: await getAgreementResources(id),
      chain: await getAgreementChain(id),
      invoices: linkedInvoices,
    });
  });
}

/**
 * Deliberately narrow: only fields that do not change commercial terms.
 * Price and resource changes go through /renew so history is preserved.
 */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid agreement id', 400);

    const existing = await db.select().from(agreements).where(eq(agreements.id, id)).get();
    if (!existing) return fail('Agreement not found', 404);

    const { data, error } = await parseBody(req, agreementEditSchema);
    if (error) return error;

    const row = await db
      .update(agreements)
      .set({
        agreementNumber: data.agreementNumber,
        title: data.title,
        notes: data.notes,
      })
      .where(eq(agreements.id, id))
      .returning()
      .get();

    return ok(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid agreement id', 400);

    const existing = await db.select().from(agreements).where(eq(agreements.id, id)).get();
    if (!existing) return fail('Agreement not found', 404);

    const child = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(eq(agreements.parentAgreementId, id))
      .get();
    if (child) {
      return fail(
        'This agreement has been renewed. Delete the newer version first to keep the history chain intact.',
        409,
      );
    }

    const linkedInvoice = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(eq(invoices.agreementId, id))
      .get();
    if (linkedInvoice) {
      return fail('This agreement has invoices raised against it and cannot be deleted.', 409);
    }

    await db.transaction(async (tx) => {
      await tx.delete(agreementResources).where(eq(agreementResources.agreementId, id)).run();
      await tx.delete(agreements).where(eq(agreements.id, id)).run();
    });

    return ok({ deleted: id });
  });
}
