import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, agreementResources, projects, clients } from '@/lib/schema';
import { agreementSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody } from '@/lib/api';
import { syncExpiredAgreements } from '@/lib/queries';
import { daysUntil } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handle(async () => {
    await syncExpiredAgreements();

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const projectId = searchParams.get('project_id');
    const expiringIn = searchParams.get('expiring_in');

    const filters = [];
    if (status === 'active' || status === 'expired' || status === 'renewed') {
      filters.push(eq(agreements.status, status));
    }
    if (projectId) filters.push(eq(agreements.projectId, Number(projectId)));
    if (expiringIn) {
      const cutoff = new Date(Date.now() + Number(expiringIn) * 86_400_000)
        .toISOString()
        .slice(0, 10);
      filters.push(
        and(eq(agreements.status, 'active'), sql`${agreements.endDate} <= ${cutoff}`)!,
      );
    }

    const rows = await db
      .select({
        id: agreements.id,
        projectId: agreements.projectId,
        parentAgreementId: agreements.parentAgreementId,
        agreementNumber: agreements.agreementNumber,
        title: agreements.title,
        scope: agreements.scope,
        value: agreements.value,
        startDate: agreements.startDate,
        endDate: agreements.endDate,
        renewalVersion: agreements.renewalVersion,
        status: agreements.status,
        notes: agreements.notes,
        projectName: projects.projectName,
        clientName: clients.companyName,
      })
      .from(agreements)
      .innerJoin(projects, eq(agreements.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(desc(agreements.id))
      .all();

    const counts = await db
      .select({
        agreementId: agreementResources.agreementId,
        c: sql<number>`count(*)`,
      })
      .from(agreementResources)
      .groupBy(agreementResources.agreementId)
      .all();

    return ok(
      rows.map((a) => ({
        ...a,
        resourceCount: counts.find((c) => c.agreementId === a.id)?.c ?? 0,
        daysToExpiry: a.status === 'active' ? daysUntil(a.endDate) : null,
      })),
    );
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, agreementSchema);
    if (error) return error;

    const project = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, data.projectId))
      .get();
    if (!project) return fail('Selected project no longer exists', 422);

    const created = await db.transaction(async (tx) => {
      const row = await tx
        .insert(agreements)
        .values({
          projectId: data.projectId,
          parentAgreementId: null,
          agreementNumber: data.agreementNumber,
          title: data.title,
          scope: data.scope,
          value: data.value,
          startDate: data.startDate,
          endDate: data.endDate,
          renewalVersion: 1,
          status: 'active',
          notes: data.notes,
        })
        .returning()
        .get();

      for (const r of data.resources) {
        await tx.insert(agreementResources)
          .values({
            agreementId: row.id,
            resourceId: r.resourceId,
            billingAmount: r.billingAmount,
          })
          .run();
      }
      return row;
    });

    return ok(created, 201);
  });
}
