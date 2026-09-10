import { notFound } from 'next/navigation';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  opportunities,
  opportunityCandidates,
  opportunityComments,
  opportunityStageHistory,
  candidates,
  clients,
  referrals,
  candidateInterviews,
  agentRuns,
} from '@/lib/schema';
import { getStageBeforeHold } from '@/lib/queries';
import { isFollowUpDue } from '@/lib/utils';
import { requireSession } from '@/lib/session';
import { stripClientBudget } from '@/lib/access';
import OpportunityDetailClient from './client';

export const dynamic = 'force-dynamic';

export default async function OpportunityDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { role } = await requireSession();

  // Every query here is keyed only on `id` from the route params — none
  // depends on another's result — so they run concurrently instead of as a
  // string of sequential round trips.
  const [
    row,
    mapped,
    comments,
    history,
    pool,
    suggestions,
    clientOptions,
    resumeTo,
    roundCounts,
    questionSets,
  ] = await Promise.all([
    db
      .select({
        id: opportunities.id,
        clientId: opportunities.clientId,
        companyName: opportunities.companyName,
        title: opportunities.title,
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
        currency: opportunities.currency,
        budgetMin: opportunities.budgetMin,
        budgetMax: opportunities.budgetMax,
        hiringBudgetMin: opportunities.hiringBudgetMin,
        hiringBudgetMax: opportunities.hiringBudgetMax,
        dealValue: opportunities.dealValue,
        jdContent: opportunities.jdContent,
        jdUpdatedAt: opportunities.jdUpdatedAt,
        workingDays: opportunities.workingDays,
        workingHours: opportunities.workingHours,
        stage: opportunities.stage,
        priority: opportunities.priority,
        owner: opportunities.owner,
        nextStep: opportunities.nextStep,
        nextStepDate: opportunities.nextStepDate,
        closedReason: opportunities.closedReason,
        isListed: opportunities.isListed,
        listedAt: opportunities.listedAt,
        publicTitle: opportunities.publicTitle,
        publicCompanyLabel: opportunities.publicCompanyLabel,
        showClientName: opportunities.showClientName,
        shareToken: opportunities.shareToken,
        convertedProjectId: opportunities.convertedProjectId,
        createdAt: opportunities.createdAt,
        clientName: clients.companyName,
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .where(eq(opportunities.id, id))
      .get(),
    db
      .select({
        id: opportunityCandidates.id,
        candidateId: opportunityCandidates.candidateId,
        status: opportunityCandidates.status,
        interviewRound: opportunityCandidates.interviewRound,
        interviewDate: opportunityCandidates.interviewDate,
        feedback: opportunityCandidates.feedback,
        expectedBilling: opportunityCandidates.expectedBilling,
        name: candidates.name,
        currentDesignation: candidates.currentDesignation,
        experienceYears: candidates.experienceYears,
        primarySkill: candidates.primarySkill,
        source: candidates.source,
        sourceName: candidates.sourceName,
        expectedCtc: candidates.expectedCtc,
        noticePeriodDays: candidates.noticePeriodDays,
      })
      .from(opportunityCandidates)
      .innerJoin(candidates, eq(opportunityCandidates.candidateId, candidates.id))
      .where(eq(opportunityCandidates.opportunityId, id))
      .all(),
    db
      .select()
      .from(opportunityComments)
      .where(eq(opportunityComments.opportunityId, id))
      .orderBy(desc(opportunityComments.id))
      .all(),
    db
      .select()
      .from(opportunityStageHistory)
      .where(eq(opportunityStageHistory.opportunityId, id))
      .orderBy(desc(opportunityStageHistory.id))
      .all(),
    db
      .select({
        id: candidates.id,
        name: candidates.name,
        currentDesignation: candidates.currentDesignation,
        primarySkill: candidates.primarySkill,
        experienceYears: candidates.experienceYears,
        source: candidates.source,
        sourceName: candidates.sourceName,
      })
      .from(candidates)
      .orderBy(candidates.name)
      .all(),
    db
      .select()
      .from(referrals)
      .where(eq(referrals.opportunityId, id))
      .orderBy(desc(referrals.id))
      .all(),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
    getStageBeforeHold(id),
    // How many rounds each mapped candidate has sat. One grouped query rather
    // than a per-row count, so the table cost does not grow with the shortlist.
    db
      .select({
        mappingId: candidateInterviews.opportunityCandidateId,
        rounds: sql<number>`count(*)`,
      })
      .from(candidateInterviews)
      .innerJoin(
        opportunityCandidates,
        eq(candidateInterviews.opportunityCandidateId, opportunityCandidates.id),
      )
      .where(eq(opportunityCandidates.opportunityId, id))
      .groupBy(candidateInterviews.opportunityCandidateId)
      .all(),
    // M28 — question sets already generated for this requirement, so they are
    // reread rather than regenerated. Only completed runs: a failed one has no
    // output to show and re-offering it as a document would be a lie.
    db
      .select({
        id: agentRuns.id,
        title: agentRuns.title,
        output: agentRuns.output,
        userName: agentRuns.userName,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.opportunityId, id),
          eq(agentRuns.agent, 'interview_questions'),
          eq(agentRuns.status, 'complete'),
        ),
      )
      .orderBy(desc(agentRuns.id))
      .limit(10)
      .all(),
  ]);

  if (!row) notFound();

  return (
    <OpportunityDetailClient
      opportunity={{
        ...stripClientBudget(role, row),
        isProspect: row.clientId === null,
        followUpDue: isFollowUpDue(row.nextStepDate),
      }}
      role={role}
      mapped={mapped}
      comments={comments}
      history={history}
      pool={pool}
      suggestions={suggestions}
      clients={clientOptions}
      resumeTo={resumeTo ?? 'requirement'}
      roundCounts={Object.fromEntries(
        roundCounts.map((r) => [r.mappingId, Number(r.rounds)]),
      )}
      questionSets={questionSets.map((q) => ({
        ...q,
        output: q.output ?? '',
        // A set generated before the JD last changed no longer describes the
        // role it was written for. Comparing against a JD-specific timestamp,
        // not a general updated_at, so fixing a typo in the next step does not
        // mark every question set stale.
        stale: Boolean(row.jdUpdatedAt && q.createdAt < row.jdUpdatedAt),
      }))}
    />
  );
}
