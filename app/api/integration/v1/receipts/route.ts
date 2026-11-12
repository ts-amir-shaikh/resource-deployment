import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceReceipts } from '@/lib/schema';
import { loadLedger, resettleInvoice } from '@/lib/invoice-ledger';
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
/**
 * Runs the receipt transaction. Two sends of one externalId can both pass the
 * replay check in POST; the unique index stops the second, and that is answered
 * as the replay it is (null here) instead of a 500.
 */
async function storeReceipt<T>(fn: Parameters<typeof db.transaction<T>>[0]): Promise<T | null> {
  try {
    return await db.transaction(fn);
  } catch (err) {
    const msg = String((err as Error)?.message ?? '');
    if (/UNIQUE/i.test(msg) && /external_id/i.test(msg)) return null;
    throw err;
  }
}

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

    const result = await storeReceipt(async (tx) => {
      const ledger = await loadLedger(tx, invoice.id);
      if (!ledger) return { ok: false as const, reason: 'currency' as const, message: 'Invoice not found.' };

      const outcome = applyReceipt(
        { ...ledger.invoice, credited: ledger.settlement.credited },
        ledger.receipts,
        {
          amount: data.amount.amount,
          tdsDeducted: data.tdsDeducted?.amount ?? 0,
          currency: data.amount.currency,
        },
      );
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

      // Status is re-derived from the whole ledger, so a partial payment moves
      // the invoice to Pending to Collect and a full one to Collected.
      await resettleInvoice(tx, invoice.id, data.receivedDate);
      const after = await loadLedger(tx, invoice.id);
      return { ...outcome, receiptId: receipt.id, status: after?.invoice.status ?? invoice.status };
    });

    if (result === null) {
      const again = await db.select().from(invoiceReceipts).where(eq(invoiceReceipts.externalId, data.externalId)).get();
      if (!again) return fail('Something went wrong.', 500);
      return ok({ receiptId: again.id, invoiceId: again.invoiceId, replayed: true });
    }
    if (!result.ok) return fail(result.message, result.reason === 'exceeds' ? 422 : 409);

    const cur = invoice.currency;
    return ok(
      {
        receiptId: result.receiptId,
        invoiceId: invoice.id,
        replayed: false,
        invoice: {
          status: result.status,
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
