import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, agreementResources, invoices, deployments } from '@/lib/schema';
import { agreementCorrectSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Corrects an agreement that was entered wrongly, in place.
 *
 * This is the counterpart to /renew, not a replacement for it:
 *
 *   renew    — the terms genuinely changed. Append a new version so the
 *              before and after are both on record.
 *   correct  — the terms were never right. Overwrite them, because a new
 *              version would assert a change that never happened.
 *
 * Because it overwrites, it is fenced in three ways: a superseded version
 * cannot be touched, a resource that deployments are mapped to cannot be
 * removed from the rate card, and rewriting figures that invoices were raised
 * against needs an explicit acknowledgement. What was corrected and why is
 * appended to the notes, so the overwrite is not silent.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid agreement id', 400);

    const existing = await db.select().from(agreements).where(eq(agreements.id, id)).get();
    if (!existing) return fail('Agreement not found', 404);

    if (existing.status === 'renewed') {
      return fail(
        'This version has been superseded by a renewal. Correct the latest version in the chain instead — editing a superseded version would rewrite history the newer version was based on.',
        409,
      );
    }

    const { data, error } = await parseBody(req, agreementCorrectSchema);
    if (error) return error;

    // A deployment points at both an agreement and a resource, and reads its
    // billing rate from the rate card. Dropping a resource that a deployment
    // is using would leave that deployment with no rate to resolve.
    const current = await db
      .select({ resourceId: agreementResources.resourceId })
      .from(agreementResources)
      .where(eq(agreementResources.agreementId, id))
      .all();

    const incoming = new Set(data.resources.map((r) => r.resourceId));
    const removed = current.map((r) => r.resourceId).filter((rid) => !incoming.has(rid));

    for (const resourceId of removed) {
      const inUse = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(
          and(eq(deployments.agreementId, id), eq(deployments.resourceId, resourceId)),
        )
        .get();
      if (inUse) {
        return fail(
          'A resource you removed still has a deployment mapped to this agreement. End or unmap that deployment first.',
          409,
        );
      }
    }

    // Rewriting the value or the rate card changes what invoices were derived
    // from. That is sometimes exactly the point of a correction, but it is
    // never something to do without seeing it.
    const linkedInvoices = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(eq(invoices.agreementId, id))
      .all();

    if (linkedInvoices.length > 0 && !data.acknowledgeInvoices) {
      return fail(
        `${linkedInvoices.length} invoice(s) were raised against this agreement. Correcting it will not change those invoices — review them afterwards.`,
        409,
        { requiresAcknowledgement: true, invoiceCount: linkedInvoices.length },
      );
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const trail = `[Corrected ${stamp}] ${data.correctionReason}`;
    const notes = data.notes ? `${data.notes}\n\n${trail}` : trail;

    const updated = await db.transaction(async (tx) => {
      const row = await tx
        .update(agreements)
        .set({
          agreementNumber: data.agreementNumber,
          title: data.title,
          scope: data.scope,
          value: data.value,
          startDate: data.startDate,
          endDate: data.endDate,
          notes,
        })
        .where(eq(agreements.id, id))
        .returning()
        .get();

      // The rate card is replaced wholesale rather than diffed — a correction
      // states what the card should have been all along.
      await tx
        .delete(agreementResources)
        .where(eq(agreementResources.agreementId, id))
        .run();

      for (const r of data.resources) {
        await tx
          .insert(agreementResources)
          .values({
            agreementId: id,
            resourceId: r.resourceId,
            billingAmount: r.billingAmount,
          })
          .run();
      }

      return row;
    });

    return ok({ ...updated, invoicesAffected: linkedInvoices.length });
  });
}
