import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, agreementResources } from '@/lib/schema';
import { agreementRenewSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Creates the next version of an agreement.
 *
 * Renewal is append-only: the incoming terms become a NEW row linked back via
 * parent_agreement_id, and the current row is marked 'renewed'. Price and
 * resource changes are therefore always diffable across versions.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid agreement id', 400);

    const parent = await db.select().from(agreements).where(eq(agreements.id, id)).get();
    if (!parent) return fail('Agreement not found', 404);

    if (parent.status === 'renewed') {
      return fail(
        'This version has already been renewed. Renew the latest version in the chain instead.',
        409,
      );
    }

    const { data, error } = await parseBody(req, agreementRenewSchema);
    if (error) return error;

    const created = await db.transaction(async (tx) => {
      const row = await tx
        .insert(agreements)
        .values({
          projectId: data.projectId,
          parentAgreementId: parent.id,
          agreementNumber: data.agreementNumber,
          title: data.title,
          scope: data.scope,
          value: data.value,
          startDate: data.startDate,
          endDate: data.endDate,
          renewalVersion: parent.renewalVersion + 1,
          status: 'active',
          notes: data.notes,
        })
        .returning()
        .get();

      // The new version's resource set is independent of the parent's, so
      // additions and removals across renewals are captured implicitly.
      for (const r of data.resources) {
        await tx.insert(agreementResources)
          .values({
            agreementId: row.id,
            resourceId: r.resourceId,
            billingAmount: r.billingAmount,
          })
          .run();
      }

      await tx.update(agreements)
        .set({ status: 'renewed' })
        .where(eq(agreements.id, parent.id))
        .run();

      return row;
    });

    return ok(created, 201);
  });
}
