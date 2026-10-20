import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources, deployments } from '@/lib/schema';

/** Every resource with its live billable and shadow allocation. */
export async function loadResources() {
  // Independent of each other — run concurrently rather than as two
  // sequential round trips to the database.
  const [rows, alloc] = await Promise.all([
    db.select().from(resources).orderBy(desc(resources.id)).all(),
    db
      .select({
        resourceId: deployments.resourceId,
        type: deployments.deploymentType,
        allocated: sql<number>`sum(${deployments.allocationPercentage})`,
      })
      .from(deployments)
      .where(eq(deployments.status, 'active'))
      .groupBy(deployments.resourceId, deployments.deploymentType)
      .all(),
  ]);

  return rows.map((r) => {
    const billable =
      alloc.find((a) => a.resourceId === r.id && a.type === 'billable')?.allocated ?? 0;
    const shadow =
      alloc.find((a) => a.resourceId === r.id && a.type === 'shadow')?.allocated ?? 0;
    return { ...r, billable, shadow, allocated: billable + shadow };
  });
}

export type ResourceRow = Awaited<ReturnType<typeof loadResources>>[number];
