import { asc, eq } from 'drizzle-orm';
import { handle, ok, fail, parseBody } from '@/lib/api';
import { db } from '@/lib/db';
import { clients, holidays } from '@/lib/schema';
import { holidaySchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handle(async () =>
    ok(
      await db
        .select({
          id: holidays.id,
          holidayDate: holidays.holidayDate,
          name: holidays.name,
          clientId: holidays.clientId,
          clientName: clients.companyName,
        })
        .from(holidays)
        .leftJoin(clients, eq(holidays.clientId, clients.id))
        .orderBy(asc(holidays.holidayDate))
        .all(),
    ),
  );
}

export async function POST(req: Request) {
  return handle(async () => {
    const { data, error } = await parseBody(req, holidaySchema);
    if (error) return error;
    if (data.clientId) {
      const c = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, data.clientId)).get();
      if (!c) return fail('Selected client no longer exists', 422);
    }
    const row = await db.insert(holidays).values(data).returning().get();
    return ok(row, 201);
  });
}
