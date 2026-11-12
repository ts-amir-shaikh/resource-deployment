import { eq } from 'drizzle-orm';
import type { Executor } from './db';
import { invoiceCreditNotes, invoiceReceipts, invoices } from './schema';
import { settle, statusAfterSettlement, type Settlement } from './invoice-rules';
import { today } from './utils';

/**
 * M62 slice B: the server half of the receipts and credit-note ledger. Reads an
 * invoice with its receipts and credit notes, and re-derives the invoice's
 * status from them after every change. Takes the transaction handle so it sees
 * the row just written.
 */

export async function loadLedger(tx: Executor, invoiceId: number) {
  const invoice = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).get();
  if (!invoice) return null;
  const receipts = await tx.select().from(invoiceReceipts).where(eq(invoiceReceipts.invoiceId, invoiceId)).orderBy(invoiceReceipts.id).all();
  const credits = await tx.select().from(invoiceCreditNotes).where(eq(invoiceCreditNotes.invoiceId, invoiceId)).orderBy(invoiceCreditNotes.id).all();
  return { invoice, receipts, credits, settlement: settle(invoice, receipts, credits) };
}

/** Recomputes the invoice's status from its ledger and stores it. */
export async function resettleInvoice(tx: Executor, invoiceId: number, receivedDate?: string): Promise<Settlement> {
  const ledger = await loadLedger(tx, invoiceId);
  if (!ledger) throw new Error('Invoice not found');
  const move = statusAfterSettlement(ledger.invoice.status, ledger.settlement);
  if (move.status !== ledger.invoice.status || move.collectedDate !== 'keep') {
    await tx
      .update(invoices)
      .set({
        status: move.status as never,
        ...(move.collectedDate === 'set' ? { collectedDate: receivedDate ?? today() } : {}),
        ...(move.collectedDate === 'clear' ? { collectedDate: null } : {}),
      })
      .where(eq(invoices.id, invoiceId))
      .run();
  }
  return ledger.settlement;
}
