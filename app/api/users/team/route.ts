import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { handle, ok, fail } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { ROLES, type Role } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Active accounts of one team role, for the owner pickers. Names and ids only
 * — never usernames, never anything about the account beyond what a picker
 * needs to show.
 */
export async function GET(req: Request) {
  return handle(async () => {
    await getViewer();
    const role = new URL(req.url).searchParams.get('role') ?? '';
    if (!['ta', 'leadgen', 'sales'].includes(role) || !ROLES.includes(role as Role)) {
      return fail('role must be ta, leadgen or sales', 400);
    }
    const rows = await db
      .select({ id: users.id, name: users.name, isTeamLead: users.isTeamLead })
      .from(users)
      .where(and(eq(users.role, role as Role), eq(users.active, true)))
      .orderBy(users.name)
      .all();
    return ok(rows);
  });
}
