import { and, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources, deployments } from '@/lib/schema';
import { resourceSchema } from '@/lib/validations';
import { handle, ok, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const skill = searchParams.get('skill')?.trim();

    const filters = [];
    if (search) {
      const q = `%${search}%`;
      filters.push(
        or(
          like(resources.name, q),
          like(resources.email, q),
          like(resources.designation, q),
        ),
      );
    }
    if (skill) {
      filters.push(
        or(
          eq(resources.primarySkill, skill),
          eq(resources.secondarySkill, skill),
          like(resources.otherSkills, `%"${skill}"%`),
        ),
      );
    }

    const rows = await db
      .select()
      .from(resources)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(resources.id))
      .all();

    // Attach live allocation so the list can show utilisation without N+1 calls.
    const alloc = await db
      .select({
        resourceId: deployments.resourceId,
        type: deployments.deploymentType,
        allocated: sql<number>`sum(${deployments.allocationPercentage})`,
      })
      .from(deployments)
      .where(eq(deployments.status, 'active'))
      .groupBy(deployments.resourceId, deployments.deploymentType)
      .all();

    const data = rows.map((r) => {
      const billable =
        alloc.find((a) => a.resourceId === r.id && a.type === 'billable')?.allocated ?? 0;
      const shadow =
        alloc.find((a) => a.resourceId === r.id && a.type === 'shadow')?.allocated ?? 0;
      return { ...r, billable, shadow, allocated: billable + shadow };
    });

    return ok(data);
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, resourceSchema);
    if (error) return error;

    const row = await db
      .insert(resources)
      .values({
        name: data.name,
        email: data.email,
        mobile: data.mobile,
        designation: data.designation,
        currentCtc: data.currentCtc,
        revisedCtc: data.revisedCtc,
        revisedEffectiveFrom: data.revisedEffectiveFrom,
        primarySkill: data.primarySkill,
        secondarySkill: data.secondarySkill,
        otherSkills: JSON.stringify(data.otherSkills ?? []),
      })
      .returning()
      .get();

    return ok(row, 201);
  });
}
