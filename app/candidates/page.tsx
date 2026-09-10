import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, resources, users } from '@/lib/schema';
import {
  getCandidateOpportunityCounts,
  getApplicationQueue,
  getApplicantAlert,
} from '@/lib/queries';
import { requireSession } from '@/lib/session';
import CandidateTabs from '@/components/candidate-tabs';
import CandidatesClient from './client';
import ApplicantsClient from './applicants';
import SeenStamp from './seen-stamp';

export const dynamic = 'force-dynamic';

/**
 * Pool and Applicants share this screen, switched by a search param rather
 * than client state — the queue has to be linkable from the sidebar badge and
 * the recruiter dashboard.
 */
export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const session = await requireSession();
  const showApplicants = searchParams.tab === 'applicants';

  // A recruiter is nagged only about requirements they own; everyone else
  // sees the whole queue. A team lead's scope is the team, so no filter.
  const me = session.uid
    ? await db
        .select({ isTeamLead: users.isTeamLead, seenAt: users.applicationsSeenAt })
        .from(users)
        .where(eq(users.id, session.uid))
        .get()
    : undefined;
  const scope =
    session.role === 'ta' && !me?.isTeamLead ? session.uid || -1 : undefined;

  const alert = await getApplicantAlert(scope, me?.seenAt ?? null);

  if (showApplicants) {
    const applications = await getApplicationQueue();
    return (
      <div>
        <CandidateTabs active="applicants" waiting={alert.pending} />
        {/* Management writes nothing by policy, so their badge counts what is
            pending rather than what is new — there is no watermark to stamp. */}
        {session.role !== 'management' && <SeenStamp />}
        <ApplicantsClient
          applications={applications}
          role={session.role}
          waiting={alert.pending}
        />
      </div>
    );
  }

  // Independent of each other — run concurrently.
  const [rows, counts, resourceOptions] = await Promise.all([
    db.select().from(candidates).orderBy(desc(candidates.id)).all(),
    getCandidateOpportunityCounts(),
    db
      .select({
        id: resources.id,
        name: resources.name,
        email: resources.email,
        mobile: resources.mobile,
        designation: resources.designation,
        currentCtc: resources.currentCtc,
        primarySkill: resources.primarySkill,
        secondarySkill: resources.secondarySkill,
      })
      .from(resources)
      .orderBy(resources.name)
      .all(),
  ]);

  const initial = rows.map((c) => {
    const n = counts.find((x) => x.candidateId === c.id);
    return { ...c, mappedCount: n?.mapped ?? 0, activeCount: n?.active ?? 0 };
  });

  return (
    <div>
      <CandidateTabs active="pool" waiting={alert.pending} />
      <CandidatesClient initial={initial} resources={resourceOptions} />
    </div>
  );
}
