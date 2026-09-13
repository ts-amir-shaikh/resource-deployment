import { and, desc, eq, like, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { candidates, resources } from '@/lib/schema';
import { candidateSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';
import { getCandidateOpportunityCounts } from '@/lib/queries';
import { requireSession } from '@/lib/session';
import { CANDIDATE_SOURCE_VALUES } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const source = searchParams.get('source');
    const skill = searchParams.get('skill')?.trim();

    const filters = [];
    if (search) {
      const q = `%${search}%`;
      filters.push(
        or(
          like(candidates.name, q),
          like(candidates.email, q),
          like(candidates.currentDesignation, q),
          like(candidates.sourceName, q),
        ),
      );
    }
    // Checked against the enum rather than a hand-typed list. The list this
    // replaces omitted 'referral', so ?source=referral silently returned
    // everything — and would have done the same for 'self'.
    if (source && (CANDIDATE_SOURCE_VALUES as readonly string[]).includes(source)) {
      filters.push(eq(candidates.source, source as (typeof CANDIDATE_SOURCE_VALUES)[number]));
    }
    if (skill) {
      filters.push(
        or(
          eq(candidates.primarySkill, skill),
          eq(candidates.secondarySkill, skill),
          like(candidates.otherSkills, `%"${skill}"%`),
        ),
      );
    }

    const rows = await db
      .select()
      .from(candidates)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(candidates.id))
      .all();

    const counts = await getCandidateOpportunityCounts();

    return ok(
      rows.map((c) => {
        const n = counts.find((x) => x.candidateId === c.id);
        return {
          ...c,
          mappedCount: n?.mapped ?? 0,
          activeCount: n?.active ?? 0,
        };
      }),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    const { data, error } = await parseBody(req, candidateSchema);
    if (error) return error;

    if (data.resourceId) {
      const r = await db
        .select({ id: resources.id })
        .from(resources)
        .where(eq(resources.id, data.resourceId))
        .get();
      if (!r) return fail('Selected bench resource no longer exists', 422);
    }

    const row = await db
      .insert(candidates)
      .values({
        resourceId: data.resourceId ?? null,
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        currentDesignation: data.currentDesignation,
        experienceYears: data.experienceYears,
        primarySkill: data.primarySkill,
        secondarySkill: data.secondarySkill,
        otherSkills: JSON.stringify(data.otherSkills ?? []),
        currentCtc: data.currentCtc,
        expectedCtc: data.expectedCtc,
        noticePeriodDays: data.noticePeriodDays,
        lastWorkingDate: data.lastWorkingDate,
        location: data.location,
        resumeUrl: data.resumeUrl,
        source: data.source,
        sourceName: data.sourceName,
        // From the session, never the payload — the same rule as every other
        // attribution column. This is what makes source 'self' mean somebody.
        createdByUserId: session.uid || null,
        notes: data.notes,
      })
      .returning()
      .get();

    return ok(row, 201);
  });
}
