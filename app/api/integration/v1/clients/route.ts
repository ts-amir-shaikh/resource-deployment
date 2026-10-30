import { asc, gt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients } from '@/lib/schema';
import { ok } from '@/lib/api';
import { integration, pageOf, pageParams } from '@/lib/integration';

export const dynamic = 'force-dynamic';

/**
 * Pull: clients with their billing details. Built by allowlist — the contact
 * names, emails and mobiles on the client record are not part of this shape.
 */
export async function GET(req: Request) {
  return integration(req, 'read', async () => {
    const { limit, cursor } = pageParams(new URL(req.url));
    const rows = await db
      .select({
        id: clients.id,
        companyName: clients.companyName,
        gstin: clients.gstin,
        billingAddress: clients.billingAddress,
        paymentTerms: clients.paymentTerms,
        defaultDueDays: clients.defaultDueDays,
      })
      .from(clients)
      .where(gt(clients.id, cursor))
      .orderBy(asc(clients.id))
      .limit(limit + 1)
      .all();
    return ok(pageOf(rows, limit));
  });
}
