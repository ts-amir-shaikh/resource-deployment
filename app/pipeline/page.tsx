import { isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, prospects } from '@/lib/schema';
import { getViewer } from '@/lib/session';
import { canExport } from '@/lib/access';
import { loadPipeline } from '@/lib/lists/load/pipeline';
import PipelineClient from './client';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const viewer = await getViewer();
  const { role } = viewer;

  // Independent of each other — run concurrently.
  const [initial, clientOptions, prospectOptions] = await Promise.all([
    loadPipeline(viewer),
    db
      .select({ id: clients.id, companyName: clients.companyName })
      .from(clients)
      .orderBy(clients.companyName)
      .all(),
    db
      .select({ id: prospects.id, companyName: prospects.companyName })
      .from(prospects)
      .where(isNull(prospects.convertedClientId))
      .orderBy(prospects.companyName)
      .all(),
  ]);

  return (
    <PipelineClient
      initial={initial}
      clients={clientOptions}
      prospects={prospectOptions}
      role={role}
      canExport={canExport(role)}
    />
  );
}
