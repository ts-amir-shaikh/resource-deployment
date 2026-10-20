import { loadClients } from '@/lib/lists/load/clients';
import { canExport } from '@/lib/access';
import ClientsClient from './client';
import { requireCurrentAccount } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const session = await requireCurrentAccount();
  const initial = await loadClients();
  return <ClientsClient initial={initial} canExport={canExport(session.role)} />;
}
