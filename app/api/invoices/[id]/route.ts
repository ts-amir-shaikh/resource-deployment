import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  invoices,
  invoiceResources,
  resources,
  projects,
  clients,
  agreements,
} from '@/lib/schema';
import { invoiceSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { isInvoiceOverdue } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const row = await db
      .select({
        id: invoices.id,
        projectId: invoices.projectId,
        agreementId: invoices.agreementId,
        invoiceNumber: invoices.invoiceNumber,
        scope: invoices.scope,
        periodFrom: invoices.periodFrom,
        periodTo: invoices.periodTo,
        amount: invoices.amount,
        gstAmount: invoices.gstAmount,
        invoiceDate: invoices.invoiceDate,
        dueDate: invoices.dueDate,
        collectedDate: invoices.collectedDate,
        status: invoices.status,
        notes: invoices.notes,
        projectName: projects.projectName,
        clientName: clients.companyName,
        agreementTitle: agreements.title,
      })
      .from(invoices)
      .innerJoin(projects, eq(invoices.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(agreements, eq(invoices.agreementId, agreements.id))
      .where(eq(invoices.id, id))
      .get();

    if (!row) return fail('Invoice not found', 404);

    const covered = await db
      .select({
        resourceId: invoiceResources.resourceId,
        name: resources.name,
        designation: resources.designation,
      })
      .from(invoiceResources)
      .innerJoin(resources, eq(invoiceResources.resourceId, resources.id))
      .where(eq(invoiceResources.invoiceId, id))
      .all();

    return ok({
      ...row,
      totalAmount: row.amount + row.gstAmount,
      overdue: isInvoiceOverdue(row.status, row.dueDate),
      resources: covered,
    });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const existing = await db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!existing) return fail('Invoice not found', 404);

    if (existing.status === 'collected') {
      return fail(
        'This invoice is collected and can no longer be edited. Void and re-raise it if a correction is needed.',
        409,
      );
    }

    const { data, error } = await parseBody(req, invoiceSchema);
    if (error) return error;

    const updated = await db.transaction(async (tx) => {
      const row = await tx
        .update(invoices)
        .set({
          projectId: data.projectId,
          agreementId: data.agreementId ?? null,
          invoiceNumber: data.invoiceNumber,
          scope: data.scope,
          periodFrom: data.periodFrom,
          periodTo: data.periodTo,
          amount: data.amount,
          gstAmount: data.gstAmount,
          invoiceDate: data.invoiceDate,
          dueDate: data.dueDate,
          notes: data.notes,
        })
        .where(eq(invoices.id, id))
        .returning()
        .get();

      await tx.delete(invoiceResources).where(eq(invoiceResources.invoiceId, id)).run();
      for (const rid of data.resourceIds) {
        await tx.insert(invoiceResources).values({ invoiceId: id, resourceId: rid }).run();
      }
      return row;
    });

    return ok(updated);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const existing = await db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!existing) return fail('Invoice not found', 404);

    if (existing.status === 'collected') {
      return fail('Collected invoices cannot be deleted — they are part of the audit trail.', 409);
    }

    await db.transaction(async (tx) => {
      await tx.delete(invoiceResources).where(eq(invoiceResources.invoiceId, id)).run();
      await tx.delete(invoices).where(eq(invoices.id, id)).run();
    });

    return ok({ deleted: id });
  });
}
