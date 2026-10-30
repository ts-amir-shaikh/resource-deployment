import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, invoiceReceipts, projects } from '@/lib/schema';
import { ok } from '@/lib/api';
import { integration, pageOf, pageParams } from '@/lib/integration';
import { invoiceShape, toInvoice } from '@/lib/integration-shapes';

export const dynamic = 'force-dynamic';

/** Pull: invoices. Filter with `status` and `agreementId`. */
export async function GET(req: Request) {
  return integration(req, 'read', async () => {
    const url = new URL(req.url);
    const { limit, cursor } = pageParams(url);
    const status = url.searchParams.get('status');
    const agreementId = Number(url.searchParams.get('agreementId'));

    const filters = [gt(invoices.id, cursor)];
    if (status === 'not_raised' || status === 'raised' || status === 'pending_collection' || status === 'collected') {
      filters.push(eq(invoices.status, status));
    }
    if (Number.isInteger(agreementId) && agreementId > 0) filters.push(eq(invoices.agreementId, agreementId));

    const rows = await db
      .select(invoiceShape)
      .from(invoices)
      .innerJoin(projects, eq(invoices.projectId, projects.id))
      .where(and(...filters))
      .orderBy(asc(invoices.id))
      .limit(limit + 1)
      .all();

    const page = pageOf(rows, limit);
    const ids = page.items.map((r) => r.id);
    const sums = ids.length
      ? await db
          .select({
            invoiceId: invoiceReceipts.invoiceId,
            amount: sql<number>`coalesce(sum(${invoiceReceipts.amount}), 0)`,
            tds: sql<number>`coalesce(sum(${invoiceReceipts.tdsDeducted}), 0)`,
          })
          .from(invoiceReceipts)
          .where(inArray(invoiceReceipts.invoiceId, ids))
          .groupBy(invoiceReceipts.invoiceId)
          .all()
      : [];

    return ok({
      items: page.items.map((r) => {
        const s = sums.find((x) => x.invoiceId === r.id);
        return toInvoice(r, { amount: s?.amount ?? 0, tds: s?.tds ?? 0 });
      }),
      nextCursor: page.nextCursor,
    });
  });
}
