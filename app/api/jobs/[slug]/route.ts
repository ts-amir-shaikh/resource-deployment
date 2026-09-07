import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients } from '@/lib/schema';
import { idFromSlug, toPublicJob, type ListableOpportunity } from '@/lib/jobs';
import { handle, ok, fail } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Public: one listed role. */
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  return handle(async () => {
    const id = idFromSlug(params.slug);
    if (id === null) return fail('Job not found', 404);

    const row = await db
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
      .where(eq(opportunities.id, id))
      .get();

    // A de-listed role answers "closed" rather than 404. Links get copied and
    // cached; someone arriving from one deserves to know the role is gone
    // rather than to wonder whether they mistyped it.
    if (!row) return fail('Job not found', 404);
    if (!row.isListed) return fail('This role is no longer open.', 410, { closed: true });

    return ok(toPublicJob(row as ListableOpportunity));
  });
}
