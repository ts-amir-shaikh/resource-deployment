import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, referrals } from '@/lib/schema';
import { applicationSchema } from '@/lib/validations';
import { idFromSlug } from '@/lib/jobs';
import { handle, ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Public: apply to a listed role.
 *
 * Writes to the referrals staging inbox rather than the candidate pool. That
 * table already exists for exactly this reason (M13): an unauthenticated form
 * must not put rows into the pool unreviewed, and this one is more exposed
 * than the share link ever was.
 *
 * The response is a bare acknowledgement — it must not become a way to probe
 * which ids are live, or whether a given person has already applied.
 */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  return handle(async () => {
    const id = idFromSlug(params.slug);
    if (id === null) return fail('Job not found', 404);

    const job = await db
      .select({ id: opportunities.id, isListed: opportunities.isListed })
      .from(opportunities)
      .where(eq(opportunities.id, id))
      .get();

    if (!job) return fail('Job not found', 404);
    if (!job.isListed) {
      return fail('This role is no longer open and is not accepting applications.', 410);
    }

    const { data, error } = await parseBody(req, applicationSchema);
    if (error) return error;

    await db.insert(referrals).values({
      opportunityId: job.id,
      kind: 'application',
      // When somebody internal referred them, that person goes in the referrer
      // columns. Otherwise the applicant is their own referrer — those columns
      // are NOT NULL and the review inbox renders both.
      referrerName: data.referrerName || data.candidateName,
      referrerEmail: data.referrerName
        ? (data.referrerEmail ?? null)
        : (data.candidateEmail ?? null),
      referrerMobile: data.referrerName ? null : (data.candidateMobile ?? null),
      candidateName: data.candidateName,
      candidateEmail: data.candidateEmail ?? null,
      candidateMobile: data.candidateMobile ?? null,
      experienceYears: data.experienceYears ?? null,
      noticePeriodDays: data.noticePeriodDays ?? null,
      currentCtc: data.currentCtc ?? null,
      expectedCtc: data.expectedCtc ?? null,
      notes: data.notes ?? null,
      status: 'new',
    });

    return ok({ received: true }, 201);
  });
}
