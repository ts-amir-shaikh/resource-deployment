/**
 * The public shape of a requirement, and the only way one becomes public.
 *
 * Built by an explicit allowlist rather than by deleting fields from a row:
 * a delete-list silently starts leaking the moment someone adds a column, and
 * the column most likely to be added to `opportunities` is a commercial one.
 * Every public surface — /jobs, /jobs/[slug], /api/jobs — goes through here.
 *
 * Never present in the output, by construction: client name (unless the
 * requirement opts in), budget, hiring budget, internal stage, priority,
 * owner, next step, share token, candidate details, or any commercial figure.
 */

export type PublicJob = {
  id: number;
  slug: string;
  title: string;
  company: string;
  experienceMin: number | null;
  experienceMax: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  otherSkills: string;
  workMode: string | null;
  location: string | null;
  timezone: string | null;
  engagementType: string | null;
  openings: number;
  jdContent: string | null;
  workingDays: string | null;
  workingHours: string | null;
  postedAt: string | null;
};

/** The row shape this needs. Deliberately narrow — see the note above. */
export type ListableOpportunity = {
  id: number;
  title: string;
  companyName: string;
  clientName?: string | null;
  isListed: boolean;
  listedAt: string | null;
  publicTitle: string | null;
  publicCompanyLabel: string | null;
  showClientName: boolean;
  experienceMin: number | null;
  experienceMax: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  otherSkills: string;
  workMode: string | null;
  location: string | null;
  timezone: string | null;
  engagementType: string | null;
  requiredCount: number;
  jdContent: string | null;
  workingDays: string | null;
  workingHours: string | null;
};

const FALLBACK_COMPANY = 'A Techstalwarts client';

/** URL-safe slug from a title. Cosmetic — the id is what resolves a job. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'role'
  );
}

export function jobPath(o: { id: number; publicTitle: string | null; title: string }): string {
  return `/jobs/${o.id}-${slugify(o.publicTitle || o.title)}`;
}

/**
 * A job URL is "<id>-<slug>". Only the leading id is trusted; the slug is
 * decoration, so retitling a role never breaks a link that is already out
 * there — and a mangled slug still resolves.
 */
export function idFromSlug(param: string): number | null {
  const id = Number(param.split('-')[0]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function toPublicJob(o: ListableOpportunity): PublicJob {
  return {
    id: o.id,
    slug: slugify(o.publicTitle || o.title),
    title: o.publicTitle || o.title,
    // Naming the client is opt-in per requirement. Without it the board shows
    // a descriptor, because a public listing is read by competitors and by
    // candidates who would otherwise approach the client directly.
    company: o.showClientName
      ? (o.clientName ?? o.companyName)
      : (o.publicCompanyLabel ?? FALLBACK_COMPANY),
    experienceMin: o.experienceMin,
    experienceMax: o.experienceMax,
    primarySkill: o.primarySkill,
    secondarySkill: o.secondarySkill,
    otherSkills: o.otherSkills,
    workMode: o.workMode,
    location: o.location,
    timezone: o.timezone,
    engagementType: o.engagementType,
    openings: o.requiredCount,
    jdContent: o.jdContent,
    workingDays: o.workingDays,
    workingHours: o.workingHours,
    postedAt: o.listedAt,
  };
}

/** "3 days ago" — a job board reads badly with raw dates. */
export function postedAgo(listedAt: string | null): string {
  if (!listedAt) return 'Recently posted';
  const then = new Date(listedAt).getTime();
  if (Number.isNaN(then)) return 'Recently posted';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted yesterday';
  if (days < 30) return `Posted ${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'Posted a month ago' : `Posted ${months} months ago`;
}
