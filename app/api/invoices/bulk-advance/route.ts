import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { invoiceBulkAdvanceSchema } from '@/lib/validations';
import { handle, ok, parseBody } from '@/lib/api';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_ORDER, today } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/**
 * Advances several invoices to the same target status in one transaction.
 * Rows already at or past the target are skipped rather than failing the
 * batch, and reported back so the UI can say what actually moved.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, invoiceBulkAdvanceSchema);
    if (error) return error;

    const targetIdx = INVOICE_STATUS_ORDER.indexOf(data.targetStatus as never);
    const rows = await db.select().from(invoices).where(inArray(invoices.id, data.ids)).all();

    const advanced: number[] = [];
    const skipped: { id: number; reason: string }[] = [];

    await db.transaction(async (tx) => {
      for (const row of rows) {
        const currentIdx = INVOICE_STATUS_ORDER.indexOf(row.status as never);
        if (currentIdx >= targetIdx) {
          skipped.push({
            id: row.id,
            reason: `Already ${INVOICE_STATUS_LABELS[row.status]}`,
          });
          continue;
        }

        const patch: Partial<typeof invoices.$inferInsert> = {
          status: data.targetStatus as never,
        };
        if (
          targetIdx >= INVOICE_STATUS_ORDER.indexOf('raised') &&
          !row.invoiceDate
        ) {
          patch.invoiceDate = today();
        }
        if (data.targetStatus === 'collected') {
          patch.collectedDate = today();
        }

        await tx.update(invoices).set(patch).where(inArray(invoices.id, [row.id])).run();
        advanced.push(row.id);
      }
    });

    const missing = data.ids.filter((id) => !rows.some((r) => r.id === id));

    return ok({
      advanced,
      skipped,
      missing,
      targetStatus: data.targetStatus,
    });
  });
}
