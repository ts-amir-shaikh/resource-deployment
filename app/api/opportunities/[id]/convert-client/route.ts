import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients } from '@/lib/schema';
import { handle, ok, fail, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Turns a prospect into a real client.
 *
 * A prospect is an opportunity with a company name but no client_id — a company
 * we are talking to before they are onboarded. This creates the clients row and
 * backfills client_id on EVERY opportunity sharing that company name, not just
 * this one: they are the same company, and leaving siblings pointing at nothing
 * is how a client ends up half-onboarded.
 *
 * Distinct from /convert, which turns a WON opportunity into a project and
 * deployments. That is the delivery handover; this is the commercial one.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const opp = await db
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
        companyName: opportunities.companyName,
      })
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!opp) return fail('Opportunity not found', 404);
    if (opp.clientId) return fail('This opportunity already belongs to a client', 409);

    const name = opp.companyName.trim();
    if (!name) return fail('This opportunity has no company name to onboard', 422);

    const result = await db.transaction(async (tx) => {
      // Reuse an existing client with the same name rather than creating a
      // duplicate — the prospect may have been onboarded from another
      // opportunity a moment ago.
      const existing = await tx
        .select({ id: clients.id })
        .from(clients)
        .where(eq(clients.companyName, name))
        .get();

      const clientId =
        existing?.id ??
        (
          await tx.insert(clients).values({ companyName: name }).returning().get()
        ).id;

      const siblings = await tx
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(eq(opportunities.companyName, name), isNull(opportunities.clientId)))
        .all();

      for (const s of siblings) {
        await tx
          .update(opportunities)
          .set({ clientId })
          .where(eq(opportunities.id, s.id))
          .run();
      }

      return { clientId, linked: siblings.length, reused: Boolean(existing) };
    });

    return ok(result, 201);
  });
}
