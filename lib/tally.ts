import 'server-only';
import { and, asc, desc, eq, like, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tallyCompanies, tallyRecords, tallySyncRuns } from '@/lib/schema';
import type { TallyEntity } from '@/lib/tally-rules';

/** M63: read-side queries for the Tally Data screen. Read only — Tally owns this data. */

export async function tallyCompanyList() {
  return db.select().from(tallyCompanies).orderBy(asc(tallyCompanies.name)).all();
}

export async function tallyCounts(companyKey: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ entity: tallyRecords.entity, n: sql<number>`count(*)` })
    .from(tallyRecords)
    .where(and(eq(tallyRecords.companyKey, companyKey), eq(tallyRecords.isDeleted, false)))
    .groupBy(tallyRecords.entity)
    .all();
  return Object.fromEntries(rows.map((r) => [r.entity, Number(r.n)]));
}

export const TALLY_PAGE_SIZE = 100;

export async function tallyRecordPage(o: { companyKey: string; entity: TallyEntity; q?: string; deleted?: boolean; page: number }) {
  const where = [eq(tallyRecords.companyKey, o.companyKey), eq(tallyRecords.entity, o.entity)];
  if (!o.deleted) where.push(eq(tallyRecords.isDeleted, false));
  if (o.q) {
    const pattern = `%${o.q}%`;
    where.push(or(like(tallyRecords.name, pattern), like(tallyRecords.parent, pattern), eq(tallyRecords.guid, o.q))!);
  }
  const filter = and(...where);
  // Vouchers read naturally newest first; masters alphabetically.
  const order = o.entity === 'voucher' ? [desc(tallyRecords.date), asc(tallyRecords.name)] : [asc(tallyRecords.name)];
  const [rows, [{ n }]] = await Promise.all([
    db
      .select({
        id: tallyRecords.id,
        guid: tallyRecords.guid,
        alterId: tallyRecords.alterId,
        name: tallyRecords.name,
        parent: tallyRecords.parent,
        date: tallyRecords.date,
        isDeleted: tallyRecords.isDeleted,
        receivedAt: tallyRecords.receivedAt,
      })
      .from(tallyRecords)
      .where(filter)
      .orderBy(...order)
      .limit(TALLY_PAGE_SIZE)
      .offset((o.page - 1) * TALLY_PAGE_SIZE)
      .all(),
    db.select({ n: sql<number>`count(*)` }).from(tallyRecords).where(filter).all(),
  ]);
  return { rows, total: Number(n) };
}

export async function tallyRecentRuns(companyKey: string, limit = 10) {
  return db
    .select()
    .from(tallySyncRuns)
    .where(eq(tallySyncRuns.companyKey, companyKey))
    .orderBy(desc(tallySyncRuns.id))
    .limit(limit)
    .all();
}
