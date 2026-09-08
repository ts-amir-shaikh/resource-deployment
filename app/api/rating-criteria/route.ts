import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ratingCriteria } from '@/lib/schema';
import { handle, ok, parseBody } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The criteria a recruiter scores against: every active global pointer, plus
 * any specific to the requirement being asked about.
 *
 * Retired criteria are excluded here but never deleted — scores already given
 * against one must stay readable on past evaluations.
 */
export async function GET(req: Request) {
  return handle(async () => {
    await requireSession();
    const opportunityId = Number(
      new URL(req.url).searchParams.get('opportunity_id') ?? '',
    );

    const scopeFilter = Number.isInteger(opportunityId) && opportunityId > 0
      ? or(
          eq(ratingCriteria.scope, 'global'),
          eq(ratingCriteria.opportunityId, opportunityId),
        )
      : and(eq(ratingCriteria.scope, 'global'), isNull(ratingCriteria.opportunityId));

    return ok(
      await db
        .select()
        .from(ratingCriteria)
        .where(and(eq(ratingCriteria.active, true), scopeFilter))
        .orderBy(asc(ratingCriteria.sortOrder), asc(ratingCriteria.id))
        .all(),
    );
  });
}

const createSchema = z.object({
  label: z.string().trim().min(1, 'Give the pointer a name').max(80),
  description: z.string().trim().max(200).optional(),
  /**
   * A global pointer joins the set offered on every future evaluation — which
   * is the whole point of a library. An opportunity-scoped one stays local to
   * a requirement whose demands are unusual.
   */
  scope: z.enum(['global', 'opportunity']).default('global'),
  opportunityId: z.coerce.number().int().positive().optional(),
});

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    const { data, error } = await parseBody(req, createSchema);
    if (error) return error;

    const last = await db
      .select({ sortOrder: ratingCriteria.sortOrder })
      .from(ratingCriteria)
      .orderBy(asc(ratingCriteria.sortOrder))
      .all();
    const nextOrder = last.length ? Math.max(...last.map((r) => r.sortOrder)) + 1 : 0;

    const row = await db
      .insert(ratingCriteria)
      .values({
        label: data.label,
        description: data.description ?? null,
        scope: data.scope,
        opportunityId: data.scope === 'opportunity' ? (data.opportunityId ?? null) : null,
        sortOrder: nextOrder,
        createdByUserId: session.uid || null,
      })
      .returning()
      .get();

    return ok(row, 201);
  });
}
