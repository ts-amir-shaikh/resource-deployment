import { desc } from 'drizzle-orm';
import { handle, ok } from '@/lib/api';
import { db } from '@/lib/db';
import { exportEvents } from '@/lib/schema';

export const dynamic = 'force-dynamic';

/** How far back the People screen's export log reaches. */
const LOG_LIMIT = 200;

/**
 * The export log (R10): every CSV download, newest first. Admin and
 * Management only — middleware applies canExport to this path.
 */
export async function GET() {
  return handle(async () => {
    const rows = await db
      .select()
      .from(exportEvents)
      .orderBy(desc(exportEvents.id))
      .limit(LOG_LIMIT)
      .all();
    return ok(
      rows.map((r) => ({
        ...r,
        fields: JSON.parse(r.fields) as string[],
        filters: JSON.parse(r.filters) as Record<string, string>,
      })),
    );
  });
}
