import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { opportunities, opportunityAssignees, users } from '@/lib/schema';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { canSetOwner } from '@/lib/ownership';

export const dynamic = 'force-dynamic';

const idOrNull = z
  .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
  .transform((v) => (v === '' || v === null ? null : Number(v)));

/**
 * Each key is optional: send only the owners you are changing. A key that is
 * present with null clears that owner.
 */
const ownersSchema = z.object({
  leadOwnerUserId: idOrNull.optional(),
  salesOwnerUserId: idOrNull.optional(),
  assigneeIds: z.array(z.coerce.number().int().positive()).max(10).optional(),
});

/** Who owns this requirement, by kind. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);
    const row = await db
      .select({
        leadOwnerUserId: opportunities.leadOwnerUserId,
        salesOwnerUserId: opportunities.salesOwnerUserId,
      })
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!row) return fail('Opportunity not found', 404);
    const assignees = await db
      .select({ userId: opportunityAssignees.userId, name: users.name })
      .from(opportunityAssignees)
      .innerJoin(users, eq(opportunityAssignees.userId, users.id))
      .where(eq(opportunityAssignees.opportunityId, id))
      .all();
    return ok({ ...row, assignees });
  });
}

/**
 * Sets owners. Admin sets any; a head sets their own kind within their team;
 * nobody else. Every target account is checked to actually hold the role the
 * slot is for — a leadgen id in the sales slot is refused, not stored.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const viewer = await getViewer();
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const existing = await db.select({ id: opportunities.id }).from(opportunities).where(eq(opportunities.id, id)).get();
    if (!existing) return fail('Opportunity not found', 404);

    const { data, error } = await parseBody(req, ownersSchema);
    if (error) return error;

    const roleOf = async (userId: number) =>
      (await db.select({ role: users.role, active: users.active }).from(users).where(eq(users.id, userId)).get()) ?? null;

    if (data.leadOwnerUserId !== undefined) {
      if (!(await canSetOwner(viewer, 'lead', data.leadOwnerUserId))) return fail('You may not set the lead owner here', 403);
      if (data.leadOwnerUserId !== null) {
        const u = await roleOf(data.leadOwnerUserId);
        if (!u || !u.active || u.role !== 'leadgen') return fail('Lead owner must be an active leadgen account', 422);
      }
    }
    if (data.salesOwnerUserId !== undefined) {
      if (!(await canSetOwner(viewer, 'sales', data.salesOwnerUserId))) return fail('You may not set the sales owner here', 403);
      if (data.salesOwnerUserId !== null) {
        const u = await roleOf(data.salesOwnerUserId);
        if (!u || !u.active || u.role !== 'sales') return fail('Sales owner must be an active sales account', 422);
      }
    }
    if (data.assigneeIds !== undefined) {
      // The right to touch the list at all is checked before the list is
      // walked — an empty array would otherwise skip every per-target check
      // and clear the assignees for anyone middleware let through.
      if (!(await canSetOwner(viewer, 'ta', null))) return fail('You may not assign TAs here', 403);
      for (const uid of data.assigneeIds) {
        if (!(await canSetOwner(viewer, 'ta', uid))) return fail('You may not assign TAs outside your team', 403);
        const u = await roleOf(uid);
        if (!u || !u.active || u.role !== 'ta') return fail('Assignees must be active TA accounts', 422);
      }
    }

    await db.transaction(async (tx) => {
      const patch: Partial<typeof opportunities.$inferInsert> = {};
      if (data.leadOwnerUserId !== undefined) patch.leadOwnerUserId = data.leadOwnerUserId;
      if (data.salesOwnerUserId !== undefined) patch.salesOwnerUserId = data.salesOwnerUserId;
      if (Object.keys(patch).length) await tx.update(opportunities).set(patch).where(eq(opportunities.id, id)).run();

      if (data.assigneeIds !== undefined) {
        // Replaced as a set — it is one list, edited as a list.
        await tx.delete(opportunityAssignees).where(eq(opportunityAssignees.opportunityId, id)).run();
        for (const uid of new Set(data.assigneeIds)) {
          await tx
            .insert(opportunityAssignees)
            .values({ opportunityId: id, userId: uid, assignedByUserId: viewer.uid || null })
            .run();
        }
      }
    });

    return ok({ id, updated: Object.keys(data) });
  });
}
