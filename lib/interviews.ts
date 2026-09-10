import 'server-only';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db, type Executor } from './db';
import {
  candidateInterviews,
  interviewPanel,
  opportunityCandidates,
  type CANDIDATE_STATUSES,
} from './schema';

export type RoundRow = {
  id: number;
  round: number;
  mode: 'internal_screening' | 'client_round' | 'final';
  scheduledAt: string | null;
  heldAt: string | null;
  outcome: 'pass' | 'fail' | 'hold' | 'no_show' | null;
  feedback: string | null;
  recommendation: string | null;
  questionsAsked: string | null;
  createdAt: string;
  panel: { name: string; designation: string | null }[];
};

/** Every round for one mapping, newest round first, each with its panel. */
export async function listRounds(mappingId: number): Promise<RoundRow[]> {
  const rounds = await db
    .select({
      id: candidateInterviews.id,
      round: candidateInterviews.round,
      mode: candidateInterviews.mode,
      scheduledAt: candidateInterviews.scheduledAt,
      heldAt: candidateInterviews.heldAt,
      outcome: candidateInterviews.outcome,
      feedback: candidateInterviews.feedback,
      recommendation: candidateInterviews.recommendation,
      questionsAsked: candidateInterviews.questionsAsked,
      createdAt: candidateInterviews.createdAt,
    })
    .from(candidateInterviews)
    .where(eq(candidateInterviews.opportunityCandidateId, mappingId))
    .orderBy(desc(candidateInterviews.round), desc(candidateInterviews.id))
    .all();

  if (rounds.length === 0) return [];

  // One query for every panel rather than one per round: a candidate at round
  // four would otherwise cost four extra round trips to render one card.
  const members = await db
    .select({
      interviewId: interviewPanel.interviewId,
      name: interviewPanel.name,
      designation: interviewPanel.designation,
    })
    .from(interviewPanel)
    .where(inArray(interviewPanel.interviewId, rounds.map((r) => r.id)))
    .orderBy(asc(interviewPanel.id))
    .all();

  return rounds.map((r) => ({
    ...r,
    panel: members
      .filter((m) => m.interviewId === r.id)
      .map(({ name, designation }) => ({ name, designation })),
  }));
}

type SyncOptions = {
  /** Set only when the recruiter asked for it — never derived from outcome. */
  moveStatus?: (typeof CANDIDATE_STATUSES)[number];
  userId: number | null;
};

/**
 * Mirrors the latest round back onto the mapping's own columns.
 *
 * `feedback`, `interview_round` and `interview_date` predate this table and are
 * read by the pipeline board, the recruiter dashboard and the share view. They
 * keep being written with the newest round so none of that has to change — the
 * difference is that the older rounds now survive in `candidate_interviews`
 * instead of being destroyed by the write.
 *
 * "Latest" is the highest round number, not the most recently created row: a
 * recruiter filling in round 1's feedback a week late must not demote the
 * mapping from round 3.
 */
export async function syncMappingFromRounds(
  tx: Executor,
  mappingId: number,
  { moveStatus, userId }: SyncOptions,
): Promise<void> {
  const latest = await tx
    .select({
      round: candidateInterviews.round,
      heldAt: candidateInterviews.heldAt,
      scheduledAt: candidateInterviews.scheduledAt,
      feedback: candidateInterviews.feedback,
    })
    .from(candidateInterviews)
    .where(eq(candidateInterviews.opportunityCandidateId, mappingId))
    .orderBy(desc(candidateInterviews.round), desc(candidateInterviews.id))
    .limit(1)
    .get();

  await tx
    .update(opportunityCandidates)
    .set({
      ...(latest
        ? {
            interviewRound: latest.round,
            interviewDate: latest.heldAt ?? latest.scheduledAt ?? null,
            feedback: latest.feedback ?? null,
          }
        : {}),
      ...(moveStatus ? { status: moveStatus } : {}),
      updatedByUserId: userId,
    })
    .where(eq(opportunityCandidates.id, mappingId))
    .run();
}

/** What the UI offers as the next stage once an outcome is picked. */
export const OUTCOME_SUGGESTS_STATUS: Record<string, string> = {
  pass: 'submitted',
  fail: 'rejected',
  hold: 'interview',
  no_show: 'interview',
};
