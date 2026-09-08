import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, opportunityComments } from '@/lib/schema';
import { shareCommentSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { token: string } };

/**
 * Public, token-addressed view of one opportunity.
 *
 * Deliberately narrow: the requirement and JD only. Budget, client contacts,
 * candidate names and every other opportunity stay server-side, because this
 * payload is readable by anyone holding the link.
 */
export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const token = params.token;
    if (!token || token.length < 8) return fail('Invalid share link', 400);

    const row = await db
      .select({
        title: opportunities.title,
        companyName: opportunities.companyName,
        experienceMin: opportunities.experienceMin,
        experienceMax: opportunities.experienceMax,
        primarySkill: opportunities.primarySkill,
        secondarySkill: opportunities.secondarySkill,
        otherSkills: opportunities.otherSkills,
        workMode: opportunities.workMode,
        location: opportunities.location,
        timezone: opportunities.timezone,
        engagementType: opportunities.engagementType,
        requiredCount: opportunities.requiredCount,
        jdContent: opportunities.jdContent,
        workingDays: opportunities.workingDays,
        workingHours: opportunities.workingHours,
        stage: opportunities.stage,
      })
      .from(opportunities)
      .where(eq(opportunities.shareToken, token))
      .get();

    if (!row) return fail('This share link is not valid', 404);

    const closed = ['won', 'lost'].includes(row.stage);

    return ok({
      ...row,
      // Stage is reduced to open/closed — internal pipeline position is not
      // the stakeholder's business.
      stage: undefined,
      closed,
    });
  });
}

/** Lets a consultant suggest a profile without an account. */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const token = params.token;
    if (!token || token.length < 8) return fail('Invalid share link', 400);

    const opp = await db
      .select({ id: opportunities.id, stage: opportunities.stage })
      .from(opportunities)
      .where(eq(opportunities.shareToken, token))
      .get();

    if (!opp) return fail('This share link is not valid', 404);
    if (['won', 'lost'].includes(opp.stage)) {
      return fail('This requirement is closed and no longer accepting suggestions.', 409);
    }

    const { data, error } = await parseBody(req, shareCommentSchema);
    if (error) return error;

    // Stakeholder comments never set the internal next step.
    const row = await db
      .insert(opportunityComments)
      .values({
        opportunityId: opp.id,
        author: data.author,
        authorRole: 'stakeholder',
        body: data.body,
        isFollowup: false,
        followUpDate: null,
      })
      .returning()
      .get();

    return ok({ id: row.id, createdAt: row.createdAt }, 201);
  });
}
