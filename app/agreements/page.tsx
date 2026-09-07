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
  // `rows` reads agreement status, so it must wait for the sync write to
  // finish — but the other three queries never touch the agreements table,
  // so they're kicked off immediately rather than waiting behind the sync.
  // (Promise.all starts everything concurrently; it does not sequence them,
  // so `rows` cannot share an array with the sync it depends on.)
  const countsPromise = db
    .select({
      agreementId: agreementResources.agreementId,
      c: sql<number>`count(*)`,
    })
    .from(agreementResources)
    .groupBy(agreementResources.agreementId)
    .all();

  const projectOptionsPromise = db
    .select({
      id: projects.id,
      projectName: projects.projectName,
      clientName: clients.companyName,
    })
    .from(projects)
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .orderBy(clients.companyName, projects.projectName)
    .all();

  const resourceOptionsPromise = db
    .select({ id: resources.id, name: resources.name, designation: resources.designation })
    .from(resources)
    .orderBy(resources.name)
    .all();

  await syncExpiredAgreements();

  const rows = await db
    .select({
      id: agreements.id,
      projectId: agreements.projectId,
      parentAgreementId: agreements.parentAgreementId,
      agreementNumber: agreements.agreementNumber,
      title: agreements.title,
      scope: agreements.scope,
      currency: agreements.currency,
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

  const [counts, projectOptions, resourceOptions] = await Promise.all([
    countsPromise,
    projectOptionsPromise,
    resourceOptionsPromise,
  ]);

  const initial = rows.map((a) => ({
    ...a,
    resourceCount: counts.find((c) => c.agreementId === a.id)?.c ?? 0,
    daysToExpiry: a.status === 'active' ? daysUntil(a.endDate) : null,
  }));

  return (
    <AgreementsClient
      initial={initial}
      projects={projectOptions}
      resources={resourceOptions}
    />
  );
}
