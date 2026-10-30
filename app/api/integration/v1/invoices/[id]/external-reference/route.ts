import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices } from '@/lib/schema';
import { externalReferenceSchema } from '@/lib/validations';
import { fail, ok, parseId } from '@/lib/api';
import { integration, readBody } from '@/lib/integration';

export const dynamic = 'force-dynamic';

/**
 * Push: the other system's record of this invoice. The same `externalId` again
 * updates the reference; a different `externalId` on an invoice that already
 * has one is refused, so two systems cannot silently disagree about which
 * record is the invoice's.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return integration(req, 'read-write', async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid invoice id', 400);

    const { data, error } = await readBody(req, externalReferenceSchema);
    if (error) return error;

    const invoice = await db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!invoice) return fail('Invoice not found', 404);

    if (invoice.externalId && invoice.externalId !== data.externalId) {
      return fail('This invoice is already linked to a different externalId.', 409);
    }

    const row = await db
      .update(invoices)
      .set({ externalId: data.externalId, externalReference: data.reference })
      .where(eq(invoices.id, id))
      .returning({ id: invoices.id, externalId: invoices.externalId, externalReference: invoices.externalReference })
      .get();
    return ok(row);
  });
}
