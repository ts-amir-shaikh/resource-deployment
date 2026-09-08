import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, opportunityComments } from '@/lib/schema';
import { commentSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    return ok(
      await db
        .select()
        .from(opportunityComments)
        .where(eq(opportunityComments.opportunityId, id))
        .orderBy(desc(opportunityComments.id))
        .all(),
    );
  });
}

export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const session = await requireSession();
    const id = parseId(params.id);
    if (!id) return fail('Invalid opportunity id', 400);

    const opp = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();
    if (!opp) return fail('Opportunity not found', 404);

    const { data, error } = await parseBody(req, commentSchema);
    if (error) return error;

    const created = await db.transaction(async (tx) => {
      const row = await tx
        .insert(opportunityComments)
        .values({
          opportunityId: id,
          // From the session, not the payload: the browser does not get to
          // decide whose name goes on a comment.
          author: session.name,
          userId: session.uid || null,
          authorRole: 'internal',
          body: data.body,
          isFollowup: data.isFollowup,
          followUpDate: data.followUpDate,
        })
        .returning()
        .get();

      // A follow-up comment also becomes the opportunity's next step, so the
      // dashboard and board surface it without reading the thread.
      if (data.isFollowup && data.followUpDate) {
        await tx.update(opportunities)
          .set({ nextStep: data.body, nextStepDate: data.followUpDate })
          .where(eq(opportunities.id, id))
          .run();
      }

      return row;
    });

    return ok(created, 201);
  });
}
