import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  opportunities,
  opportunityCandidates,
  opportunityComments,
  opportunityStageHistory,
  candidates,
  clients,
  referrals,
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
  const [row, mapped, comments, history, pool, suggestions, resumeTo] = await Promise.all([
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
        budgetMin: opportunities.budgetMin,
        budgetMax: opportunities.budgetMax,
        hiringBudgetMin: opportunities.hiringBudgetMin,
        hiringBudgetMax: opportunities.hiringBudgetMax,
        jdContent: opportunities.jdContent,
        workingDays: opportunities.workingDays,
        workingHours: opportunities.workingHours,
        stage: opportunities.stage,
        priority: opportunities.priority,
        owner: opportunities.owner,
        nextStep: opportunities.nextStep,
        nextStepDate: opportunities.nextStepDate,
        closedReason: opportunities.closedReason,
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
    getStageBeforeHold(id),
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
      resumeTo={resumeTo ?? 'requirement'}
    />
  );
}
