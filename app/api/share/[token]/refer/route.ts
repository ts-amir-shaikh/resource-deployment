import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, referrals } from '@/lib/schema';
import { referralSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { token: string } };

/**
 * Structured candidate recommendation from the public share link.
 *
 * Unauthenticated and forwardable, so it writes to `referrals` — a staging
 * inbox — rather than straight into the candidate pool. Someone internal
 * decides what becomes a candidate; see POST /api/referrals/[id]/accept.
 *
 * Nothing about the opportunity is echoed back beyond an acknowledgement:
 * the response must not become a way to probe which tokens are live.
 */
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
      return fail('This requirement is closed and no longer accepting profiles.', 409);
    }

    const { data, error } = await parseBody(req, referralSchema);
    if (error) return error;

    const row = await db
      .insert(referrals)
      .values({
        opportunityId: opp.id,
        referrerName: data.referrerName,
        referrerEmail: data.referrerEmail ?? null,
        referrerMobile: data.referrerMobile ?? null,
        candidateName: data.candidateName,
        candidateEmail: data.candidateEmail ?? null,
        candidateMobile: data.candidateMobile ?? null,
        experienceYears: data.experienceYears ?? null,
        noticePeriodDays: data.noticePeriodDays ?? null,
        currentCtc: data.currentCtc ?? null,
        expectedCtc: data.expectedCtc ?? null,
        notes: data.notes ?? null,
        status: 'new',
      })
      .returning()
      .get();

    return ok({ id: row.id }, 201);
  });
}
