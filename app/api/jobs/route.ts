import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients } from '@/lib/schema';
import { toPublicJob, type ListableOpportunity } from '@/lib/jobs';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Public: every currently listed role.
 *
 * Unauthenticated, so the select is an explicit allowlist and the result is
 * mapped through toPublicJob — nothing commercial exists in the payload to be
 * leaked in the first place.
 */
export async function GET() {
  return handle(async () => {
    const rows = await db
      .select({
        id: opportunities.id,
        title: opportunities.title,
        companyName: opportunities.companyName,
        clientName: clients.companyName,
        isListed: opportunities.isListed,
        listedAt: opportunities.listedAt,
        publicTitle: opportunities.publicTitle,
        publicCompanyLabel: opportunities.publicCompanyLabel,
        showClientName: opportunities.showClientName,
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
        jdContent: opportunities.jdContent,
        workingDays: opportunities.workingDays,
        workingHours: opportunities.workingHours,
      })
      .from(opportunities)
      .leftJoin(clients, eq(opportunities.clientId, clients.id))
      .where(eq(opportunities.isListed, true))
      .orderBy(desc(opportunities.listedAt), desc(opportunities.id))
      .all();

    // The JD is long and nobody reads it in a list — withheld until the
    // detail page asks for it.
    return ok(
      rows.map((r) => ({ ...toPublicJob(r as ListableOpportunity), jdContent: null })),
    );
  });
}
