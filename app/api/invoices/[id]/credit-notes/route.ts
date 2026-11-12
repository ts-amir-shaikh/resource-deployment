import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceCreditNotes } from '@/lib/schema';
import { creditNoteSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { creditAllowed } from '@/lib/invoice-rules';
import { loadLedger, resettleInvoice } from '@/lib/invoice-ledger';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/** The credit notes on an invoice. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);
    const rows = await db.select().from(invoiceCreditNotes).where(eq(invoiceCreditNotes.invoiceId, id)).orderBy(invoiceCreditNotes.id).all();
    return ok(rows);
  });
}

/**
 * M62 slice B (G-ACC-03): cancels all or part of a raised invoice. The invoice
 * keeps its number and status and shows its net amount. A credit note is never
 * edited or deleted (no such route exists), and cannot exceed the invoice.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);
    const { data, error } = await parseBody(req, creditNoteSchema);
    if (error) return error;
    const session = await getSession();

    const result = await db.transaction(async (tx) => {
      const ledger = await loadLedger(tx, id);
      if (!ledger) return { kind: 'missing' as const };
      const allowed = creditAllowed(ledger.invoice, ledger.credits, { amount: data.amount, gstAmount: data.gstAmount });
      if (!allowed.ok) return { kind: 'refused' as const, message: allowed.message };
      const row = await tx
        .insert(invoiceCreditNotes)
        .values({
          invoiceId: id,
          creditDate: data.creditDate,
          amount: data.amount,
          gstAmount: data.gstAmount,
          reason: data.reason,
          createdByUserId: session?.uid || null,
        })
        .returning()
        .get();
      const settlement = await resettleInvoice(tx, id, data.creditDate);
      return { kind: 'ok' as const, row, settlement };
    });

    if (result.kind === 'missing') return fail('Invoice not found', 404);
    if (result.kind === 'refused') return fail(result.message, 422);
    return ok({ ...result.row, outstanding: result.settlement.outstanding }, 201);
  });
}
