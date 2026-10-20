import { loadResources } from '@/lib/lists/load/resources';
import { canExport } from '@/lib/access';
import ResourcesClient from './client';
import { requireCurrentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const session = await requireCurrentAccount();
  const initial = await loadResources();
  return <ResourcesClient initial={initial} canExport={canExport(session.role)} />;
}
