import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoiceReceipts } from '@/lib/schema';
import { receiptReverseSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { canReverse } from '@/lib/invoice-rules';
import { loadLedger, resettleInvoice } from '@/lib/invoice-ledger';
import { getSession } from '@/lib/session';
import { today } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * M62 slice B: a mistaken receipt is reversed by a counter-entry carrying the
 * negated amounts, never edited or deleted, so the receipts read as a ledger.
 * The invoice's status is then re-derived, which may reopen a Collected invoice.
 */
export async function POST(req: Request, { params }: { params: { id: string; rid: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    const rid = parseId(params.rid);
    if (!id || !rid) return fail('Invalid id', 400);
    const { data, error } = await parseBody(req, receiptReverseSchema);
    if (error) return error;
    const session = await getSession();

    const result = await db.transaction(async (tx) => {
      const target = await tx
        .select()
        .from(invoiceReceipts)
        .where(and(eq(invoiceReceipts.id, rid), eq(invoiceReceipts.invoiceId, id)))
        .get();
      if (!target) return { kind: 'missing' as const };
      const ledger = await loadLedger(tx, id);
      if (!ledger) return { kind: 'missing' as const };
      const allowed = canReverse(target, ledger.receipts);
      if (!allowed.ok) return { kind: 'refused' as const, message: allowed.message };
      await tx
        .insert(invoiceReceipts)
        .values({
          invoiceId: id,
          receivedDate: today(),
          amount: -target.amount,
          tdsDeducted: -target.tdsDeducted,
          note: data.note ?? `Reverses receipt #${target.id}`,
          source: 'manual',
          reversesId: target.id,
          createdByUserId: session?.uid || null,
        })
        .run();
      const settlement = await resettleInvoice(tx, id);
      return { kind: 'ok' as const, settlement };
    });

    if (result.kind === 'missing') return fail('Receipt not found', 404);
    if (result.kind === 'refused') return fail(result.message, 409);
    return ok({ reversed: rid, outstanding: result.settlement.outstanding }, 201);
  });
}
