import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agentRuns, opportunities } from '@/lib/schema';
import { requireSession } from '@/lib/session';
import { isConfigured } from '@/lib/agents/client';
import { capState } from '@/lib/agents/run';
import AgentsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const { role } = await requireSession();

  const [runs, openRequirements, cap] = await Promise.all([
    db
      .select({
        id: agentRuns.id,
        agent: agentRuns.agent,
        status: agentRuns.status,
        title: agentRuns.title,
        userName: agentRuns.userName,
        output: agentRuns.output,
        error: agentRuns.error,
        model: agentRuns.model,
        costUsd: agentRuns.costUsd,
        inputTokens: agentRuns.inputTokens,
        outputTokens: agentRuns.outputTokens,
        opportunityId: agentRuns.opportunityId,
        createdAt: agentRuns.createdAt,
      })
      .from(agentRuns)
      .orderBy(desc(agentRuns.id))
      .limit(50)
      .all(),
    db
      .select({ id: opportunities.id, title: opportunities.title, companyName: opportunities.companyName })
      .from(opportunities)
      .orderBy(desc(opportunities.id))
      .all(),
    capState(),
  ]);

  return (
    <AgentsClient
      role={role}
      configured={isConfigured()}
      runs={runs}
      requirements={openRequirements}
      cap={cap}
    />
  );
}
