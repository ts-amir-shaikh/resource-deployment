import 'server-only';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import type { Executor } from './db';
import { clients, holidays } from './schema';

export type MyHoliday = { date: string; name: string; clientName: string | null };

/** Company-wide holidays plus those of the given clients, inside a range. */
export async function holidaysBetween(
  tx: Executor,
  from: string,
  to: string,
  clientIds: number[],
): Promise<MyHoliday[]> {
  const scope = clientIds.length
    ? or(isNull(holidays.clientId), inArray(holidays.clientId, clientIds))
    : isNull(holidays.clientId);
  const rows = await tx
    .select({ date: holidays.holidayDate, name: holidays.name, clientName: clients.companyName })
    .from(holidays)
    .leftJoin(clients, eq(holidays.clientId, clients.id))
    .where(and(gte(holidays.holidayDate, from), lte(holidays.holidayDate, to), scope))
    .orderBy(asc(holidays.holidayDate))
    .all();
  return rows;
}
