import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients } from '@/lib/schema';
import { clientBillingSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * M62 (G-ACC-02). Billing details only. Accounts may write this path and not
 * `/api/clients/:id`, which also rewrites the contact record and deletes — see
 * ACCOUNTS_WRITE_RULES in lib/access.ts. The body is validated by
 * clientBillingSchema, which has no other client field in it, so nothing else
 * can be changed through here whoever calls it.
 */
export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid client id', 400);

    const existing = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, id)).get();
    if (!existing) return fail('Client not found', 404);

    const { data, error } = await parseBody(req, clientBillingSchema);
    if (error) return error;

    // Cleared fields must be written as NULL: drizzle skips `undefined` keys.
    const row = await db
      .update(clients)
      .set({
        gstin: data.gstin ?? null,
        billingAddress: data.billingAddress ?? null,
        paymentTerms: data.paymentTerms ?? null,
        defaultDueDays: data.defaultDueDays ?? null,
      })
      .where(eq(clients.id, id))
      .returning({
        id: clients.id,
        gstin: clients.gstin,
        billingAddress: clients.billingAddress,
        paymentTerms: clients.paymentTerms,
        defaultDueDays: clients.defaultDueDays,
      })
      .get();
    return ok(row);
  });
}
