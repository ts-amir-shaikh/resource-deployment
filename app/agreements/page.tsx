import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  agreements,
  agreementResources,
  projects,
  clients,
  resources,
} from '@/lib/schema';
import { syncExpiredAgreements } from '@/lib/queries';
import { daysUntil } from '@/lib/utils';
import AgreementsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  await syncExpiredAgreements();

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

  const initial = rows.map((a) => ({
    ...a,
    resourceCount: counts.find((c) => c.agreementId === a.id)?.c ?? 0,
    daysToExpiry: a.status === 'active' ? daysUntil(a.endDate) : null,
  }));

  const projectOptions = await db
    .select({
      id: projects.id,
      projectName: projects.projectName,
      clientName: clients.companyName,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(clients.companyName, projects.projectName)
    .all();

  const resourceOptions = await db
    .select({ id: resources.id, name: resources.name, designation: resources.designation })
    .from(resources)
    .orderBy(resources.name)
    .all();

  return (
    <AgreementsClient
      initial={initial}
      projects={projectOptions}
      resources={resourceOptions}
    />
  );
}
