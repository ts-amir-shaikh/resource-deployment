import { beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { DDL } from './ddl';
import * as schema from './schema';
import { storeTallyPush } from './tally-store';
import type { TallyPush, TallyPushRecord } from './tally-rules';

/**
 * Runs the real SQL against an in-memory libSQL database built from lib/ddl.ts,
 * so the upsert, the AlterID guard and the never-delete rule are proven on the
 * same engine Turso runs.
 */

let db: ReturnType<typeof drizzle<typeof schema>>;
beforeEach(async () => {
  const client = createClient({ url: ':memory:' });
  await client.executeMultiple(DDL);
  db = drizzle(client, { schema });
});

const rec = (over: Partial<TallyPushRecord> = {}): TallyPushRecord => ({
  entity: 'ledger',
  guid: 'led-sharma',
  alterId: 10,
  name: 'Sharma Traders',
  parent: 'Sundry Debtors',
  date: null,
  isDeleted: false,
  deletedAt: null,
  updatedAt: '2026-10-30T10:00:00.000Z',
  data: { name: 'Sharma Traders', openingBalance: -1180 },
  ...over,
});
const push = (records: TallyPushRecord[]): TallyPush => ({
  source: 'tally-bridge',
  version: 1,
  company: { key: 'co-ts', name: 'TechStalwarts LLP - from April 1, 2021', booksFrom: '2021-04-01' },
  records,
});
const rows = () => db.select().from(schema.tallyRecords).all();

describe('M63: storing a Tally push', () => {
  it('inserts, then treats an identical resend as a no-op', async () => {
    const batch = push([rec(), rec({ entity: 'voucher', guid: 'v-1', name: 'Sales 1', parent: 'Sales', date: '2026-10-01', data: { amount: 1180 } })]);
    expect(await storeTallyPush(db, batch, 7)).toEqual({ received: 2, inserted: 2, updated: 0, unchanged: 0 });
    expect(await storeTallyPush(db, batch, 7)).toEqual({ received: 2, inserted: 0, updated: 0, unchanged: 2 });
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(JSON.parse(all.find((r) => r.guid === 'v-1')!.data)).toEqual({ amount: 1180 });
  });

  it('a newer AlterID updates the row; an older one never overwrites it', async () => {
    await storeTallyPush(db, push([rec()]), 7);
    await storeTallyPush(db, push([rec({ alterId: 12, data: { name: 'Sharma Traders', email: 'a@b.co' } })]), 7);
    expect(await storeTallyPush(db, push([rec({ alterId: 11, data: { name: 'stale' } })]), 7)).toMatchObject({ unchanged: 1 });
    const [row] = await rows();
    expect(row.alterId).toBe(12);
    expect(JSON.parse(row.data)).toEqual({ name: 'Sharma Traders', email: 'a@b.co' });
  });

  it('marks a record deleted in Tally and keeps it; a restore clears the mark', async () => {
    await storeTallyPush(db, push([rec()]), 7);
    await storeTallyPush(db, push([rec({ isDeleted: true, deletedAt: '2026-10-30T11:00:00.000Z' })]), 7);
    let [row] = await rows();
    expect(row).toMatchObject({ isDeleted: true, deletedAt: '2026-10-30T11:00:00.000Z' });
    await storeTallyPush(db, push([rec({ alterId: 13 })]), 7);
    [row] = await rows();
    expect(row).toMatchObject({ isDeleted: false, deletedAt: null, alterId: 13 });
  });

  it('keeps the same GUID apart across companies and entities', async () => {
    await storeTallyPush(db, push([rec(), rec({ entity: 'group' })]), 7);
    await storeTallyPush(db, { ...push([rec()]), company: { key: 'co-other', name: 'Other', booksFrom: null } }, 7);
    expect(await rows()).toHaveLength(3);
  });

  it('records the company and a sync log row for every push, even an empty one', async () => {
    await storeTallyPush(db, push([rec()]), 7, new Date('2026-10-30T10:00:00Z'));
    await storeTallyPush(db, push([]), 7, new Date('2026-10-30T10:05:00Z'));
    const [co] = await db.select().from(schema.tallyCompanies).all();
    expect(co).toMatchObject({ companyKey: 'co-ts', name: 'TechStalwarts LLP - from April 1, 2021', lastPushAt: '2026-10-30T10:05:00.000Z' });
    const runs = await db.select().from(schema.tallySyncRuns).all();
    expect(runs.map((r) => [r.keyId, r.received, r.inserted])).toEqual([[7, 1, 1], [7, 0, 0]]);
  });
});
