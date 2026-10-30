import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceReceipts } from '@/lib/schema';
import { receiptPushSchema } from '@/lib/validations';
import { fail, ok } from '@/lib/api';
import { integration, readBody } from '@/lib/integration';
import { applyReceipt } from '@/lib/integration-rules';

export const dynamic = 'force-dynamic';

/**
 * Push: a payment received. Idempotent on `externalId` — a retry answers 200
 * with the receipt already stored and changes nothing. Whether the invoice is
 * now Collected is worked out here from the receipts (lib/integration-rules.ts);
 * the caller cannot set it. The whole thing runs in one transaction, so a
 * receipt is never stored without the status it implies.
 */
export async function POST(req: Request) {
  return integration(req, 'read-write', async (caller) => {
    const { data, error } = await readBody(req, receiptPushSchema);
    if (error) return error;

    const replay = await db
      .select()
      .from(invoiceReceipts)
      .where(eq(invoiceReceipts.externalId, data.externalId))
      .get();
    if (replay) return ok({ receiptId: replay.id, invoiceId: replay.invoiceId, replayed: true });

    const matches = data.invoiceId
      ? await db.select().from(invoices).where(eq(invoices.id, data.invoiceId)).all()
      : await db.select().from(invoices).where(eq(invoices.invoiceNumber, data.invoiceNumber!)).all();
    if (matches.length === 0) return fail('No invoice matches that invoiceId or invoiceNumber.', 404);
    if (matches.length > 1) {
      return fail('More than one invoice has that number. Send invoiceId instead.', 409);
    }
    const invoice = matches[0];

    const result = await db.transaction(async (tx) => {
      const earlier = await tx
        .select({ amount: invoiceReceipts.amount, tdsDeducted: invoiceReceipts.tdsDeducted })
        .from(invoiceReceipts)
        .where(eq(invoiceReceipts.invoiceId, invoice.id))
        .all();

      const outcome = applyReceipt(invoice, earlier, {
        amount: data.amount.amount,
        tdsDeducted: data.tdsDeducted?.amount ?? 0,
        currency: data.amount.currency,
      });
      if (!outcome.ok) return outcome;

      const receipt = await tx
        .insert(invoiceReceipts)
        .values({
          invoiceId: invoice.id,
          externalId: data.externalId,
          receivedDate: data.receivedDate,
          amount: data.amount.amount,
          tdsDeducted: data.tdsDeducted?.amount ?? 0,
          note: data.note ?? null,
          source: 'integration',
          keyId: caller.keyId,
        })
        .returning({ id: invoiceReceipts.id })
        .get();

      if (outcome.collected && invoice.status !== 'collected') {
        await tx
          .update(invoices)
          .set({ status: 'collected', collectedDate: data.receivedDate })
          .where(and(eq(invoices.id, invoice.id)))
          .run();
      }
      return { ...outcome, receiptId: receipt.id };
    });

    if (!result.ok) return fail(result.message, result.reason === 'exceeds' ? 422 : 409);

    const cur = invoice.currency;
    return ok(
      {
        receiptId: result.receiptId,
        invoiceId: invoice.id,
        replayed: false,
        invoice: {
          status: result.collected ? 'collected' : invoice.status,
          total: { amount: result.total, currency: cur },
          received: { amount: result.received, currency: cur },
          tdsDeducted: { amount: result.tds, currency: cur },
          outstanding: { amount: result.outstanding, currency: cur },
        },
      },
      201,
    );
  });
}
