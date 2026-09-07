import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities, clients } from '@/lib/schema';
import { toPublicJob, type ListableOpportunity } from '@/lib/jobs';
import JobsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Open Roles · Techstalwarts',
  description:
    'Current contract and permanent technology roles we are hiring for at Techstalwarts.',
};

export default async function JobsPage() {
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

  // Mapped server-side: the JD never reaches the list payload, and nothing
  // commercial is in the object the browser receives.
  const jobs = rows.map((r) => ({
    ...toPublicJob(r as ListableOpportunity),
    jdContent: null,
  }));

  return <JobsClient jobs={jobs} />;
}
