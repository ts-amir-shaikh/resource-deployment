import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { opportunities } from '@/lib/schema';
import ShareClient from './client';

export const dynamic = 'force-dynamic';

/**
 * Public, unauthenticated view addressed by share token.
 *
 * Only the requirement is selected — budget, client contacts, candidate names
 * and internal notes never reach this page, because anyone holding the link
 * can read it.
 */
export default async function SharePage({ params }: { params: { token: string } }) {
  const row = await db
    .select({
      title: opportunities.title,
      companyName: opportunities.companyName,
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
      stage: opportunities.stage,
    })
    .from(opportunities)
    .where(eq(opportunities.shareToken, params.token))
    .get();

  if (!row) notFound();

  const { stage, ...requirement } = row;

  return (
    <ShareClient
      token={params.token}
      requirement={requirement}
      closed={['won', 'lost'].includes(stage)}
    />
  );
}
