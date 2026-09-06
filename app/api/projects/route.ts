import { and, desc, eq, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, deployments } from '@/lib/schema';
import { projectSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search')?.trim();
    const clientId = searchParams.get('client_id');

    const filters = [];
    if (search) filters.push(like(projects.projectName, `%${search}%`));
    if (clientId) filters.push(eq(projects.clientId, Number(clientId)));

    const rows = await db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        projectName: projects.projectName,
        managerName: projects.managerName,
        managerEmail: projects.managerEmail,
        managerMobile: projects.managerMobile,
        managerDesignation: projects.managerDesignation,
        createdAt: projects.createdAt,
        clientName: clients.companyName,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(projects.id))
      .all();

    const stats = await db
      .select({
        projectId: deployments.projectId,
        headcount: sql<number>`count(distinct ${deployments.resourceId})`,
        billing: sql<number>`coalesce(sum(case when ${deployments.deploymentType} = 'billable' then ${deployments.billingAmount} else 0 end), 0)`,
      })
      .from(deployments)
      .where(eq(deployments.status, 'active'))
      .groupBy(deployments.projectId)
      .all();

    return ok(
      rows.map((p) => {
        const s = stats.find((x) => x.projectId === p.id);
        return {
          ...p,
          headcount: s?.headcount ?? 0,
          monthlyBilling: s?.billing ?? 0,
        };
      }),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, projectSchema);
    if (error) return error;

    const client = await db
      .select({ id: clients.id })
      .from(clients)
      .where(eq(clients.id, data.clientId))
      .get();
    if (!client) return fail('Selected client no longer exists', 422);

    const row = await db.insert(projects).values(data).returning().get();
    return ok(row, 201);
  });
}
