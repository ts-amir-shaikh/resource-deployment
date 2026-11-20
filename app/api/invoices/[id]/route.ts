import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  invoices,
  invoiceEdits,
  invoiceResources,
  resources,
  projects,
  clients,
  agreements,
  users,
} from '@/lib/schema';
import { collectedInvoiceSchema, invoiceSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { withTimesheetLeave } from '@/lib/timesheets';
import { isInvoiceOverdue, invoiceLineRow } from '@/lib/utils';
import { collectedEditError, collectedInvoicePatch, invoiceEditDiff } from '@/lib/invoice-edit-rules';

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
        monthlyRate: invoiceResources.monthlyRate,
        workingDays: invoiceResources.workingDays,
        leaveDays: invoiceResources.leaveDays,
        paidLeaveDays: invoiceResources.paidLeaveDays,
        unpaidLeaveDays: invoiceResources.unpaidLeaveDays,
        deploymentDate: invoiceResources.deploymentDate,
        lastWorkingDate: invoiceResources.lastWorkingDate,
        billedDays: invoiceResources.billedDays,
        lineAmount: invoiceResources.amount,
        leaveFromTimesheet: invoiceResources.leaveFromTimesheet,
      })
      .from(invoiceResources)
      .innerJoin(resources, eq(invoiceResources.resourceId, resources.id))
      .where(eq(invoiceResources.invoiceId, id))
      .all();

    // M70: empty for every invoice that has never been corrected after
    // collection, which is almost all of them.
    const edits = await db
      .select({
        id: invoiceEdits.id,
        field: invoiceEdits.field,
        valueBefore: invoiceEdits.valueBefore,
        valueAfter: invoiceEdits.valueAfter,
        byName: users.name,
        createdAt: invoiceEdits.createdAt,
      })
      .from(invoiceEdits)
      .leftJoin(users, eq(invoiceEdits.byUserId, users.id))
      .where(eq(invoiceEdits.invoiceId, id))
      .orderBy(desc(invoiceEdits.id))
      .all();

    return ok({
      ...row,
      totalAmount: row.amount + row.gstAmount,
      overdue: isInvoiceOverdue(row.status, row.dueDate),
      resources: covered,
      edits,
    });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const existing = await db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!existing) return fail('Invoice not found', 404);

    // M70 (D25): a collected invoice is a record of what was billed and paid,
    // so the money on it is closed. What stays open is the clerical surface —
    // the number, the three dates and the notes — because the alternative for
    // a transposed number was voiding and re-raising a paid invoice. The
    // narrow schema and the allowlisted patch are both deliberate: neither
    // one alone would stop an amount arriving in the body.
    if (existing.status === 'collected') {
      const session = await requireSession();
      const { data, error } = await parseBody(req, collectedInvoiceSchema);
      if (error) return error;

      const patch = collectedInvoicePatch(data);
      const refusal = collectedEditError(patch);
      if (refusal) return fail(refusal, 422);

      const changes = invoiceEditDiff(existing, patch);
      if (changes.length === 0) return ok(existing);

      const updated = await db.transaction(async (tx) => {
        const row = await tx.update(invoices).set(patch).where(eq(invoices.id, id)).returning().get();
        // D26: append-only, one row per field, so a later question about a
        // paid invoice's number has an answer rather than a mystery.
        for (const change of changes) {
          await tx
            .insert(invoiceEdits)
            .values({
              invoiceId: id,
              field: change.field,
              valueBefore: change.before,
              valueAfter: change.after,
              byUserId: session.uid || null,
            })
            .run();
        }
        return row;
      });

      return ok(updated);
    }

    const { data, error } = await parseBody(req, invoiceSchema);
    if (error) return error;

    // The create route has always validated the agreement; this one never did,
    // so an edit could quietly point an invoice at a PO from another project.
    if (data.agreementId) {
      const agreement = await db
        .select({
          id: agreements.id,
          projectId: agreements.projectId,
          currency: agreements.currency,
        })
        .from(agreements)
        .where(eq(agreements.id, data.agreementId))
        .get();
      if (!agreement) return fail('Selected agreement no longer exists', 422);
      if (agreement.projectId !== data.projectId) {
        return fail('That agreement belongs to a different project', 422, {
          fields: { agreementId: 'Pick an agreement from the selected project' },
        });
      }
      if (agreement.currency !== data.currency) {
        return fail(
          `This agreement is in ${agreement.currency}; the invoice must be raised in the same currency.`,
          422,
          { fields: { currency: `Must be ${agreement.currency}` } },
        );
      }
    }

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
          currency: data.currency,
          fxRateToInr: data.fxRateToInr,
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
      for (const typed of data.lines) {
        // M65: approved timesheets supply the leave when they cover the period.
        const { leaveFromTimesheet, ...line } = await withTimesheetLeave(tx, typed, data);
        await tx
          .insert(invoiceResources)
          .values({ invoiceId: id, ...invoiceLineRow(line, data), leaveFromTimesheet })
          .run();
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
