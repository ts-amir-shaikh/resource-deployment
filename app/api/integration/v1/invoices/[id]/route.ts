import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceResources, invoiceReceipts, invoiceCreditNotes, projects, resources } from '@/lib/schema';
import { fail, ok, parseId } from '@/lib/api';
import { integration } from '@/lib/integration';
import { invoiceShape, toInvoice } from '@/lib/integration-shapes';

export const dynamic = 'force-dynamic';

/**
 * Pull: one invoice with its lines and receipts. A line carries the resource's
 * name, the days billed and the amount — never the monthly rate or anything
 * about the resource's cost.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  return integration(req, 'read', async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const row = await db
      .select(invoiceShape)
      .from(invoices)
      .innerJoin(projects, eq(invoices.projectId, projects.id))
      .where(eq(invoices.id, id))
      .get();
    if (!row) return fail('Invoice not found', 404);

    const [lines, receipts] = await Promise.all([
      db
        .select({
          resourceName: resources.name,
          billedDays: invoiceResources.billedDays,
          amount: invoiceResources.amount,
        })
        .from(invoiceResources)
        .innerJoin(resources, eq(invoiceResources.resourceId, resources.id))
        .where(eq(invoiceResources.invoiceId, id))
        .all(),
      db
        .select({
          id: invoiceReceipts.id,
          externalId: invoiceReceipts.externalId,
          receivedDate: invoiceReceipts.receivedDate,
          amount: invoiceReceipts.amount,
          tdsDeducted: invoiceReceipts.tdsDeducted,
          note: invoiceReceipts.note,
        })
        .from(invoiceReceipts)
        .where(eq(invoiceReceipts.invoiceId, id))
        .orderBy(asc(invoiceReceipts.id))
        .all(),
    ]);

    const creditRows = await db
      .select({ amount: invoiceCreditNotes.amount, gstAmount: invoiceCreditNotes.gstAmount })
      .from(invoiceCreditNotes)
      .where(eq(invoiceCreditNotes.invoiceId, id))
      .all();
    const credited = creditRows.reduce((s, c) => s + c.amount + c.gstAmount, 0);
    const received = receipts.reduce((s, r) => s + r.amount, 0);
    const tds = receipts.reduce((s, r) => s + r.tdsDeducted, 0);
    return ok({
      ...toInvoice(row, { amount: received, tds }, credited),
      lines: lines.map((l) => ({
        resourceName: l.resourceName,
        billedDays: l.billedDays,
        amount: { amount: l.amount, currency: row.currency },
      })),
      receipts,
    });
  });
}
