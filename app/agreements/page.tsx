import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, resources } from '@/lib/schema';
import { loadAgreements } from '@/lib/lists/load/agreements';
import { canExport } from '@/lib/access';
import AgreementsClient from './client';
import { requireCurrentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function AgreementsPage() {
  const session = await requireCurrentAccount();
  // Independent of each other — run concurrently. loadAgreements brings
  // lapsed agreements up to date before reading them; the option lists never
  // touch the agreements table, so they need not wait behind that write.
  const [initial, projectOptions, resourceOptions] = await Promise.all([
    loadAgreements(),
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
      .select({ id: resources.id, name: resources.name, designation: resources.designation })
      .from(resources)
      .orderBy(resources.name)
      .all(),
  ]);

  return (
    <AgreementsClient
      initial={initial}
      projects={projectOptions}
      resources={resourceOptions}
      canExport={canExport(session.role)}
    />
  );
}
