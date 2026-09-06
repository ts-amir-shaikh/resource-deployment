import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources, deployments } from '@/lib/schema';
import ResourcesClient from './client';

export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const rows = await db.select().from(resources).orderBy(desc(resources.id)).all();

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

  const initial = rows.map((r) => {
    const billable =
      alloc.find((a) => a.resourceId === r.id && a.type === 'billable')?.allocated ?? 0;
    const shadow =
      alloc.find((a) => a.resourceId === r.id && a.type === 'shadow')?.allocated ?? 0;
    return { ...r, billable, shadow, allocated: billable + shadow };
  });

  return <ResourcesClient initial={initial} />;
}
