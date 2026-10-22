import { eq } from 'drizzle-orm';
import { handle, ok, fail, parseId } from '@/lib/api';
import { db } from '@/lib/db';
import { holidays } from '@/lib/schema';

export const dynamic = 'force-dynamic';

/**
 * Removing a holiday changes nothing already entered: days a resource marked
 * as a holiday stay marked until they edit them. The calendar only pre-fills.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid id', 400);
    await db.delete(holidays).where(eq(holidays.id, id)).run();
    return ok({ deleted: true });
  });
}
