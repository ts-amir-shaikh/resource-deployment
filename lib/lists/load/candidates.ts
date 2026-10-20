import 'server-only';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates } from '@/lib/schema';
import { getCandidateOpportunityCounts, getApplicationQueue } from '@/lib/queries';

/** The candidate pool, newest first, with how many requirements each is on. */
export async function loadCandidates() {
  const [rows, counts] = await Promise.all([
    db.select().from(candidates).orderBy(desc(candidates.id)).all(),
    getCandidateOpportunityCounts(),
  ]);

  return rows.map((c) => {
    const n = counts.find((x) => x.candidateId === c.id);
    return { ...c, mappedCount: n?.mapped ?? 0, activeCount: n?.active ?? 0 };
  });
}

export type CandidateRow = Awaited<ReturnType<typeof loadCandidates>>[number];

/** The Applicants queue: everything the public job page and share links brought in. */
export const loadApplications = getApplicationQueue;
