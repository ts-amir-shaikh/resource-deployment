import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, resources } from '@/lib/schema';
import { getCandidateOpportunityCounts } from '@/lib/queries';
import CandidatesClient from './client';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage() {
  const rows = await db.select().from(candidates).orderBy(desc(candidates.id)).all();
  const counts = await getCandidateOpportunityCounts();

  const initial = rows.map((c) => {
    const n = counts.find((x) => x.candidateId === c.id);
    return { ...c, mappedCount: n?.mapped ?? 0, activeCount: n?.active ?? 0 };
  });

  const resourceOptions = await db
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
    .all();

  return <CandidatesClient initial={initial} resources={resourceOptions} />;
}
