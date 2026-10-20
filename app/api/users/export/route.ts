import { handle } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { listPeople } from '@/lib/accounts/people';
import { peopleList } from '@/lib/lists/people';

export const dynamic = 'force-dynamic';

/** CSV of the People list. Back office only — see canExport in lib/access.ts. */
export async function GET(req: Request) {
  return handle(async () => {
    const session = await requireSession();
    return exportResponse({ req, actor: session, def: peopleList, rows: await listPeople() });
  });
}
