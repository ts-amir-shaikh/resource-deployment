import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, agreements, resources } from '@/lib/schema';
import { loadInvoices } from '@/lib/lists/load/invoices';
import { canExport } from '@/lib/access';
import InvoicesClient from './client';
import { requireCurrentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const session = await requireCurrentAccount();
  // Independent of each other — run concurrently.
  const [initial, projectOptions, agreementOptions, resourceOptions] = await Promise.all([
    loadInvoices(),
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
    db
      .select({
        id: agreements.id,
        projectId: agreements.projectId,
        title: agreements.title,
        agreementNumber: agreements.agreementNumber,
        renewalVersion: agreements.renewalVersion,
      })
      .from(agreements)
      .orderBy(agreements.title)
      .all(),
    db
      .select({ id: resources.id, name: resources.name })
      .from(resources)
      .orderBy(resources.name)
      .all(),
  ]);

  return (
    <InvoicesClient
      initial={initial}
      projects={projectOptions}
      agreements={agreementOptions}
      resources={resourceOptions}
      canExport={canExport(session.role)}
    />
  );
}
