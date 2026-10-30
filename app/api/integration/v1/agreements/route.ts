import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, invoices, projects } from '@/lib/schema';
import { ok } from '@/lib/api';
import { integration, pageOf, pageParams } from '@/lib/integration';
import { poConsumption } from '@/lib/po-rules';

export const dynamic = 'force-dynamic';

/** Pull: agreements with PO consumption. Filter with `status`. */
export async function GET(req: Request) {
  return integration(req, 'read', async () => {
    const url = new URL(req.url);
    const { limit, cursor } = pageParams(url);
    const status = url.searchParams.get('status');

    const filters = [gt(agreements.id, cursor)];
    if (status === 'active' || status === 'expired' || status === 'renewed') {
      filters.push(eq(agreements.status, status));
    }

    const rows = await db
      .select({
        id: agreements.id,
        agreementNumber: agreements.agreementNumber,
        title: agreements.title,
        clientId: projects.clientId,
        projectId: agreements.projectId,
        currency: agreements.currency,
        value: agreements.value,
        startDate: agreements.startDate,
        endDate: agreements.endDate,
        status: agreements.status,
        renewalVersion: agreements.renewalVersion,
      })
      .from(agreements)
      .innerJoin(projects, eq(agreements.projectId, projects.id))
      .where(and(...filters))
      .orderBy(asc(agreements.id))
      .limit(limit + 1)
      .all();

    const page = pageOf(rows, limit);
    const ids = page.items.map((a) => a.id);
    const invs = ids.length
      ? await db
          .select({
            agreementId: invoices.agreementId,
            amount: invoices.amount,
            currency: invoices.currency,
            status: invoices.status,
          })
          .from(invoices)
          .where(inArray(invoices.agreementId, ids))
          .all()
      : [];

    return ok({
      items: page.items.map((a) => {
        const c = poConsumption(a, invs.filter((i) => i.agreementId === a.id));
        return { ...a, consumption: { invoiced: c.invoiced, remaining: c.remaining, state: c.state } };
      }),
      nextCursor: page.nextCursor,
    });
  });
}
