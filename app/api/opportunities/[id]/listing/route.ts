import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { opportunities } from '@/lib/schema';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Publishing controls only. The client label and the name-them-publicly flag
 * moved to the requirement form, which is Admin-only — TA can publish a role
 * but not decide how the client is described to the world.
 */
const listingSchema = z
  .object({
    isListed: z.coerce.boolean(),
    publicTitle: z.string().trim().max(120).optional(),
  })
  .transform((d) => ({ ...d, publicTitle: d.publicTitle || undefined }));

/**
 * Publishes a requirement to the public board, or withdraws it.
 *
 * Its own route rather than a field on the opportunity PUT, because the two
 * have different audiences: editing the requirement is Admin-only (M12), while
 * TA keeps the board current. The write policy already allows TA everything
 * nested under an opportunity, so this needs no change there.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const existing = await db
      .select({
        id: opportunities.id,
        stage: opportunities.stage,
        isListed: opportunities.isListed,
        listedAt: opportunities.listedAt,
      })
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!existing) return fail('Opportunity not found', 404);

    const { data, error } = await parseBody(req, listingSchema);
    if (error) return error;

    if (data.isListed && ['won', 'lost'].includes(existing.stage)) {
      return fail(
        'This requirement is closed and cannot be advertised. Reopen it first.',
        409,
      );
    }

    const row = await db
      .update(opportunities)
      .set({
        isListed: data.isListed,
        // Stamped on the first publish and kept across later edits, so
        // amending advert copy does not push an old role back to the top.
        listedAt: data.isListed ? (existing.listedAt ?? new Date().toISOString()) : null,
        publicTitle: data.publicTitle ?? null,
      })
      .where(eq(opportunities.id, id))
      .returning()
      .get();

    return ok({
      id: row.id,
      isListed: row.isListed,
      listedAt: row.listedAt,
      publicTitle: row.publicTitle,
    });
  });
}
