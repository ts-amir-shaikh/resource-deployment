import { db } from '@/lib/db';
import { invoiceReceipts } from '@/lib/schema';
import { receiptEntrySchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { applyReceipt } from '@/lib/integration-rules';
import { loadLedger, resettleInvoice } from '@/lib/invoice-ledger';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * M62 slice B (G-ACC-04): Accounts records a payment against an invoice, in the
 * invoice's own currency. Whether the invoice is now Collected is derived from
 * the receipts (lib/invoice-rules.ts), never taken from the body. One
 * transaction, so a receipt is never stored without the status it implies.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);
    const { data, error } = await parseBody(req, receiptEntrySchema);
    if (error) return error;
    const session = await getSession();

    const result = await db.transaction(async (tx) => {
      const ledger = await loadLedger(tx, id);
      if (!ledger) return { kind: 'missing' as const };
      const outcome = applyReceipt(
        { ...ledger.invoice, credited: ledger.settlement.credited },
        ledger.receipts,
        { amount: data.amount, tdsDeducted: data.tdsDeducted, currency: ledger.invoice.currency },
      );
      if (!outcome.ok) return { kind: 'refused' as const, outcome };
      const receipt = await tx
        .insert(invoiceReceipts)
        .values({
          invoiceId: id,
          receivedDate: data.receivedDate,
          amount: data.amount,
          tdsDeducted: data.tdsDeducted,
          note: data.note ?? null,
          source: 'manual',
          createdByUserId: session?.uid || null,
        })
        .returning({ id: invoiceReceipts.id })
        .get();
      const settlement = await resettleInvoice(tx, id, data.receivedDate);
      return { kind: 'ok' as const, receiptId: receipt.id, settlement };
    });

    if (result.kind === 'missing') return fail('Invoice not found', 404);
    if (result.kind === 'refused') return fail(result.outcome.message, result.outcome.reason === 'exceeds' ? 422 : 409);
    return ok({ receiptId: result.receiptId, outstanding: result.settlement.outstanding }, 201);
  });
}
