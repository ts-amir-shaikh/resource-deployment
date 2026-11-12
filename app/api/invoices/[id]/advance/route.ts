import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceReceipts, invoiceCreditNotes } from '@/lib/schema';
import { invoiceAdvanceSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_ORDER,
  nextInvoiceStatus,
  today,
} from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Advances an invoice along the forward-only lifecycle:
 *   Not Raised -> Raised -> Pending to Collect -> Collected
 *
 * Side effects the user would otherwise have to remember:
 *   - entering 'raised'    stamps invoice_date if it is not already set
 *   - entering 'collected' stamps collected_date
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const existing = await db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!existing) return fail('Invoice not found', 404);

    const { data, error } = await parseBody(req, invoiceAdvanceSchema);
    if (error) return error;

    const target = data.targetStatus ?? nextInvoiceStatus(existing.status);
    if (!target) {
      return fail('This invoice is already collected — there is no next step.', 409);
    }

    const currentIdx = INVOICE_STATUS_ORDER.indexOf(existing.status as never);
    const targetIdx = INVOICE_STATUS_ORDER.indexOf(target as never);

    if (targetIdx <= currentIdx) {
      return fail(
        `Status moves forward only. This invoice is already "${INVOICE_STATUS_LABELS[existing.status]}".`,
        409,
      );
    }

    const patch: Partial<typeof invoices.$inferInsert> = { status: target as never };

    // D15: a proforma carries its own number.
    if (target === 'proforma') {
      const number = data.proformaNumber ?? existing.proformaNumber;
      if (!number) {
        return fail('Give the proforma a number.', 422, { fields: { proformaNumber: 'Enter the proforma number' } });
      }
      patch.proformaNumber = number;
    }

    // Collected is derived from receipts once any exist (M62 slice B). Moving
    // it by hand would leave the status and the money disagreeing.
    if (target === 'collected') {
      const ledgerRow =
        (await db.select({ id: invoiceReceipts.id }).from(invoiceReceipts).where(eq(invoiceReceipts.invoiceId, id)).get()) ??
        (await db.select({ id: invoiceCreditNotes.id }).from(invoiceCreditNotes).where(eq(invoiceCreditNotes.invoiceId, id)).get());
      if (ledgerRow) {
        return fail('Payments or credit notes are recorded on this invoice. Record the remaining payment as a receipt and it becomes Collected.', 409);
      }
    }

    // Stamp the dates the crossed stages imply, without overwriting real entries.
    if (targetIdx >= INVOICE_STATUS_ORDER.indexOf('raised') && !existing.invoiceDate) {
      patch.invoiceDate = today();
    }
    if (target === 'collected') {
      patch.collectedDate = today();
    }

    const row = await db
      .update(invoices)
      .set(patch)
      .where(eq(invoices.id, id))
      .returning()
      .get();

    return ok(row);
  });
}
