import { db } from '@/lib/db';
import { clients } from '@/lib/schema';
import { loadProjects } from '@/lib/lists/load/projects';
import { canExport } from '@/lib/access';
import ProjectsClient from './client';
import { requireCurrentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const session = await requireCurrentAccount();
  // Independent of each other — run concurrently.
  const [initial, clientOptions] = await Promise.all([
    loadProjects(),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
  ]);

  return (
    <ProjectsClient
      initial={initial}
      clients={clientOptions}
      canExport={canExport(session.role)}
    />
  );
}
