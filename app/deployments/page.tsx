import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, agreements } from '@/lib/schema';
import { loadDeployments } from '@/lib/lists/load/deployments';
import { canExport } from '@/lib/access';
import { getResourceUtilisation } from '@/lib/queries';
import DeploymentsClient from './client';
import { requireCurrentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DeploymentsPage() {
  const session = await requireCurrentAccount();
  // Independent of each other — run concurrently.
  const [rows, resourceOptions, projectOptions, agreementOptions] = await Promise.all([
    loadDeployments(),
    getResourceUtilisation(),
    db
      .select({
        id: projects.id,
        projectName: projects.projectName,
        clientName: clients.companyName,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .orderBy(clients.companyName, projects.projectName)
      .all(),
    // Only active agreements are offered when mapping a new deployment —
    // a renewed or expired version is not something to bill new work under.
    db
      .select({
        id: agreements.id,
        projectId: agreements.projectId,
        title: agreements.title,
        agreementNumber: agreements.agreementNumber,
        renewalVersion: agreements.renewalVersion,
      })
      .from(agreements)
      .where(eq(agreements.status, 'active'))
      .orderBy(agreements.title)
      .all(),
  ]);

  return (
    <DeploymentsClient
      initial={rows}
      resources={resourceOptions}
      projects={projectOptions}
      agreements={agreementOptions}
      canExport={canExport(session.role)}
    />
  );
}
