import { desc, eq, like, or, sql, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, projects, deployments } from '@/lib/schema';
import { clientSchema } from '@/lib/validations';
import { handle, ok, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();

    const rows = await db
      .select()
      .from(clients)
      .where(
        search
          ? or(
              like(clients.companyName, `%${search}%`),
              like(clients.spocName, `%${search}%`),
            )
          : undefined,
      )
      .orderBy(desc(clients.id))
      .all();

    const projectCounts = await db
      .select({
        clientId: projects.clientId,
        count: sql<number>`count(*)`,
      })
      .from(projects)
      .groupBy(projects.clientId)
      .all();

    const billing = await db
      .select({
        clientId: projects.clientId,
        total: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .where(
        and(eq(deployments.status, 'active'), eq(deployments.deploymentType, 'billable')),
      )
      .groupBy(projects.clientId)
      .all();

    return ok(
      rows.map((c) => ({
        ...c,
        projectCount: projectCounts.find((p) => p.clientId === c.id)?.count ?? 0,
        monthlyBilling: billing.find((b) => b.clientId === c.id)?.total ?? 0,
      })),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, clientSchema);
    if (error) return error;
    const row = await db.insert(clients).values(data).returning().get();
    return ok(row, 201);
  });
}
