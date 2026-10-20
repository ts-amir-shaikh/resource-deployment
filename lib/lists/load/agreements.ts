import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, agreementResources, projects, clients } from '@/lib/schema';
import { syncExpiredAgreements } from '@/lib/queries';
import { daysUntil } from '@/lib/utils';

/**
 * Every agreement version with its resource count and days to expiry.
 * Brings lapsed agreements up to date first, so status is never stale.
 */
export async function loadAgreements() {
  // `rows` reads agreement status, so it must wait for the sync write to
  // finish — but the counts query never touches the agreements table, so it
  // is kicked off immediately rather than waiting behind the sync.
  const countsPromise = db
    .select({
      agreementId: agreementResources.agreementId,
      c: sql<number>`count(*)`,
    })
    .from(agreementResources)
    .groupBy(agreementResources.agreementId)
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

  const counts = await countsPromise;

  return rows.map((a) => ({
    ...a,
    resourceCount: counts.find((c) => c.agreementId === a.id)?.c ?? 0,
    daysToExpiry: a.status === 'active' ? daysUntil(a.endDate) : null,
  }));
}

export type AgreementRow = Awaited<ReturnType<typeof loadAgreements>>[number];
