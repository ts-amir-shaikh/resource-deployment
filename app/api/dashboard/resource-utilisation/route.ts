import { handle, ok } from '@/lib/api';
import { getResourceUtilisation } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () => ok(await getResourceUtilisation()));
}
