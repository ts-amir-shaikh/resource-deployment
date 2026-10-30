import { and, eq, inArray, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as schema from './schema';
import { tallyCompanies, tallyRecords, tallySyncRuns } from './schema';
import { decideTallyWrite, newestPerRecord, type TallyPush } from './tally-rules';

/**
 * M63: stores one push from the Tally bridge. Kept apart from lib/db so the
 * tests can run it against an in-memory libSQL database.
 *
 * Two round trips to Turso whatever the batch size — one read, one batch of
 * writes (libSQL runs a batch as a single transaction) — so a 200-record push
 * stays well inside a serverless function's time limit. Each write is also
 * guarded in SQL (`excluded.alter_id >= alter_id`), so even two pushes racing
 * cannot let an older copy of a record overwrite a newer one.
 */

type Db = LibSQLDatabase<typeof schema>;

export type TallyStoreResult = { received: number; inserted: number; updated: number; unchanged: number };

export async function storeTallyPush(db: Db, push: TallyPush, keyId: number | null, now = new Date()): Promise<TallyStoreResult> {
  const at = now.toISOString();
  const companyKey = push.company.key;
  const records = newestPerRecord(push.records);
  const result: TallyStoreResult = { received: push.records.length, inserted: 0, updated: 0, unchanged: 0 };

  const stored = records.length
    ? await db
        .select({ entity: tallyRecords.entity, guid: tallyRecords.guid, alterId: tallyRecords.alterId, isDeleted: tallyRecords.isDeleted, data: tallyRecords.data })
        .from(tallyRecords)
        .where(and(eq(tallyRecords.companyKey, companyKey), inArray(tallyRecords.guid, records.map((r) => r.guid))))
        .all()
    : [];
  const byKey = new Map(stored.map((s) => [`${s.entity}|${s.guid}`, s]));

  const writes = [];
  for (const r of records) {
    const decision = decideTallyWrite(byKey.get(`${r.entity}|${r.guid}`), r);
    result[decision === 'insert' ? 'inserted' : decision === 'update' ? 'updated' : 'unchanged']++;
    if (decision === 'unchanged') continue;
    const row = {
      companyKey,
      entity: r.entity,
      guid: r.guid,
      alterId: r.alterId,
      name: r.name,
      parent: r.parent,
      date: r.date,
      data: JSON.stringify(r.data),
      isDeleted: r.isDeleted,
      deletedAt: r.isDeleted ? (r.deletedAt ?? at) : null,
      sourceUpdatedAt: r.updatedAt,
      receivedAt: at,
    };
    writes.push(
      db
        .insert(tallyRecords)
        .values(row)
        .onConflictDoUpdate({
          target: [tallyRecords.companyKey, tallyRecords.entity, tallyRecords.guid],
          set: {
            alterId: row.alterId,
            name: row.name,
            parent: row.parent,
            date: row.date,
            data: row.data,
            isDeleted: row.isDeleted,
            deletedAt: row.deletedAt,
            sourceUpdatedAt: row.sourceUpdatedAt,
            receivedAt: row.receivedAt,
          },
          setWhere: sql`excluded.alter_id >= ${tallyRecords.alterId}`,
        }),
    );
  }

  await db.batch([
    db
      .insert(tallyCompanies)
      .values({ companyKey, name: push.company.name, booksFrom: push.company.booksFrom, lastPushAt: at })
      .onConflictDoUpdate({
        target: tallyCompanies.companyKey,
        set: { name: push.company.name, booksFrom: push.company.booksFrom, lastPushAt: at },
      }),
    ...writes,
    db.insert(tallySyncRuns).values({ keyId, companyKey, ...result }),
  ]);
  return result;
}
