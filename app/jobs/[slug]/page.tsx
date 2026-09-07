import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { db } from '@/lib/db';
import { opportunities, clients } from '@/lib/schema';
import { idFromSlug, toPublicJob, type ListableOpportunity } from '@/lib/jobs';
import JobDetailClient from './client';

export const dynamic = 'force-dynamic';

async function loadJob(slug: string) {
  const id = idFromSlug(slug);
  if (id === null) return null;
  return db
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
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const row = await loadJob(params.slug);
  if (!row || !row.isListed) return { title: 'Role closed · Techstalwarts' };
  const job = toPublicJob(row as ListableOpportunity);
  return {
    title: `${job.title} · Techstalwarts`,
    description: (job.jdContent ?? '').slice(0, 155) || `${job.title} at ${job.company}.`,
  };
}

export default async function JobDetailPage({ params }: { params: { slug: string } }) {
  const row = await loadJob(params.slug);
  if (!row) notFound();

  // A de-listed role says so rather than 404ing. Job links get shared and
  // cached; somebody arriving from one should learn the role closed instead
  // of wondering whether they mistyped the address.
  if (!row.isListed) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 text-center sm:px-8">
        <div className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-ink3">
          <Briefcase className="h-4 w-4" />
          Techstalwarts
        </div>
        <h1 className="text-xl font-semibold text-ink">This requirement is closed</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink2">
          The role you followed has been filled or withdrawn, so it is no longer
          accepting applications.
        </p>
        <Link href="/jobs" className="btn-primary mt-6 inline-flex">
          <ArrowLeft className="h-4 w-4" /> See open roles
        </Link>
      </div>
    );
  }

  return <JobDetailClient job={toPublicJob(row as ListableOpportunity)} />;
}
