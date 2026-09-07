import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients } from '@/lib/schema';
import { getOpportunityCandidateCounts } from '@/lib/queries';
import { isFollowUpDue } from '@/lib/utils';
import { requireSession } from '@/lib/session';
import { stripClientBudgetAll } from '@/lib/access';
import PipelineClient from './client';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const { role } = await requireSession();

  // Independent of each other — run concurrently.
  const [rows, counts, clientOptions] = await Promise.all([
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
        workMode: opportunities.workMode,
        location: opportunities.location,
        timezone: opportunities.timezone,
        engagementType: opportunities.engagementType,
        requiredCount: opportunities.requiredCount,
        budgetMin: opportunities.budgetMin,
        budgetMax: opportunities.budgetMax,
        hiringBudgetMin: opportunities.hiringBudgetMin,
        hiringBudgetMax: opportunities.hiringBudgetMax,
        stage: opportunities.stage,
        priority: opportunities.priority,
        owner: opportunities.owner,
        nextStep: opportunities.nextStep,
        nextStepDate: opportunities.nextStepDate,
        closedReason: opportunities.closedReason,
        convertedProjectId: opportunities.convertedProjectId,
        clientName: clients.companyName,
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .orderBy(desc(opportunities.id))
      .all(),
    getOpportunityCandidateCounts(),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
  ]);

  // What the client pays never reaches a TA browser — stripped here, on the
  // server, rather than hidden in the markup.
  const visible = stripClientBudgetAll(role, rows);

  const initial = visible.map((o) => {
    const c = counts.find((x) => x.opportunityId === o.id);
    return {
      ...o,
      isProspect: o.clientId === null,
      mappedCount: c?.mapped ?? 0,
      filledCount: c?.filled ?? 0,
      followUpDue: isFollowUpDue(o.nextStepDate),
    };
  });

  return <PipelineClient initial={initial} clients={clientOptions} role={role} />;
}
