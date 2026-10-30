import { z } from 'zod';

/**
 * M63: what the Tally bridge sends and how a record is stored, with no
 * database, so the rules can be tested directly.
 *
 * The bridge (tally-bridge.exe on the Accounts PC) reads TallyPrime, keeps its
 * own copy, and pushes changed records here in batches. Tally owns this data:
 * the app only mirrors it, keyed by Tally's GUID, with AlterID as the version.
 * Nothing is ever deleted — a record removed in Tally arrives with
 * `isDeleted: true` and stays, marked.
 */

export const TALLY_ENTITIES = ['group', 'ledger', 'voucherType', 'stockItem', 'voucher'] as const;
export type TallyEntity = (typeof TALLY_ENTITIES)[number];

export const TALLY_ENTITY_LABELS: Record<TallyEntity, string> = {
  group: 'Groups',
  ledger: 'Ledgers',
  voucherType: 'Voucher types',
  stockItem: 'Stock items',
  voucher: 'Vouchers',
};

/** Most records a single push may carry. The bridge sends 200. */
export const TALLY_MAX_BATCH = 500;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

const tallyRecordSchema = z.object({
  entity: z.enum(TALLY_ENTITIES),
  guid: z.string().trim().min(1).max(200),
  alterId: z.number().int().min(0),
  name: z.string().max(500),
  parent: z.string().max(500).nullable(),
  date: isoDate.nullable(),
  isDeleted: z.boolean(),
  deletedAt: z.string().nullable(),
  updatedAt: z.string(),
  data: z.record(z.unknown()),
});

/**
 * One push from the bridge: one company, up to TALLY_MAX_BATCH records.
 * Unknown top-level fields are ignored so the bridge can add some later
 * without breaking older app versions.
 */
export const tallyPushSchema = z.object({
  source: z.literal('tally-bridge'),
  version: z.literal(1),
  company: z.object({
    key: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(300),
    booksFrom: isoDate.nullable(),
  }),
  records: z.array(tallyRecordSchema).max(TALLY_MAX_BATCH),
});

export type TallyPush = z.infer<typeof tallyPushSchema>;
export type TallyPushRecord = TallyPush['records'][number];

/** What is already stored for a record, as far as deciding a write goes. */
export type StoredTallyVersion = { alterId: number; isDeleted: boolean; data: string };

export type TallyWrite = 'insert' | 'update' | 'unchanged';

/**
 * Whether an incoming record changes what is stored.
 *
 * A lower AlterID is an older copy arriving late (a retry after a newer push
 * landed) and is never allowed to win. The same AlterID still counts as a
 * change when the deleted flag or the data differ: Tally does not bump AlterID
 * when a record is deleted, and the bridge resends a record after repairing
 * drift. Anything else is a harmless repeat, which is what makes a resend safe.
 */
export function decideTallyWrite(stored: StoredTallyVersion | undefined, incoming: TallyPushRecord): TallyWrite {
  if (!stored) return 'insert';
  if (incoming.alterId < stored.alterId) return 'unchanged';
  if (incoming.alterId > stored.alterId) return 'update';
  if (incoming.isDeleted !== stored.isDeleted) return 'update';
  return JSON.stringify(incoming.data) === stored.data ? 'unchanged' : 'update';
}

/** Several pushes of the same record in one batch: keep only the newest. */
export function newestPerRecord(records: TallyPushRecord[]): TallyPushRecord[] {
  const out = new Map<string, TallyPushRecord>();
  for (const r of records) {
    const k = `${r.entity}|${r.guid}`;
    const prev = out.get(k);
    if (!prev || r.alterId >= prev.alterId) out.set(k, r);
  }
  return [...out.values()];
}
