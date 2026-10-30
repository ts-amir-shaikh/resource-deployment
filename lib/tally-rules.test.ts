import { describe, expect, it } from 'vitest';
import { decideTallyWrite, newestPerRecord, tallyPushSchema, TALLY_MAX_BATCH, type TallyPushRecord } from './tally-rules';

const rec = (over: Partial<TallyPushRecord> = {}): TallyPushRecord => ({
  entity: 'ledger',
  guid: 'g-1',
  alterId: 10,
  name: 'Sharma Traders',
  parent: 'Sundry Debtors',
  date: null,
  isDeleted: false,
  deletedAt: null,
  updatedAt: '2026-10-30T10:00:00.000Z',
  data: { name: 'Sharma Traders', gstin: '27AAPFU0939F1ZV' },
  ...over,
});
const push = (records: unknown[]) => ({
  source: 'tally-bridge',
  version: 1,
  company: { key: 'co-1', name: 'TechStalwarts LLP - from April 1, 2021', booksFrom: '2021-04-01' },
  records,
});

describe('M63: Tally push shape', () => {
  it('accepts what the bridge sends, ignoring fields added later', () => {
    const parsed = tallyPushSchema.parse({ ...push([rec()]), sentAt: 'later field' });
    expect(parsed.records[0].guid).toBe('g-1');
    expect(parsed).not.toHaveProperty('sentAt');
  });

  it('refuses another source, an unknown entity, a missing GUID or a negative AlterID', () => {
    expect(tallyPushSchema.safeParse({ ...push([rec()]), source: 'other' }).success).toBe(false);
    expect(tallyPushSchema.safeParse(push([{ ...rec(), entity: 'employee' }])).success).toBe(false);
    expect(tallyPushSchema.safeParse(push([{ ...rec(), guid: ' ' }])).success).toBe(false);
    expect(tallyPushSchema.safeParse(push([{ ...rec(), alterId: -1 }])).success).toBe(false);
  });

  it(`caps a push at ${TALLY_MAX_BATCH} records`, () => {
    const many = Array.from({ length: TALLY_MAX_BATCH + 1 }, (_, i) => rec({ guid: `g-${i}` }));
    expect(tallyPushSchema.safeParse(push(many)).success).toBe(false);
    expect(tallyPushSchema.safeParse(push(many.slice(1))).success).toBe(true);
  });
});

describe('M63: deciding a Tally write', () => {
  const stored = { alterId: 10, isDeleted: false, data: JSON.stringify(rec().data) };

  it('inserts what is new and ignores an exact repeat (a safe resend)', () => {
    expect(decideTallyWrite(undefined, rec())).toBe('insert');
    expect(decideTallyWrite(stored, rec())).toBe('unchanged');
  });

  it('a newer AlterID updates; an older copy arriving late never wins', () => {
    expect(decideTallyWrite(stored, rec({ alterId: 11 }))).toBe('update');
    expect(decideTallyWrite(stored, rec({ alterId: 9, data: { name: 'Old name' } }))).toBe('unchanged');
  });

  it('a delete or restore at the same AlterID still counts (Tally does not bump it)', () => {
    expect(decideTallyWrite(stored, rec({ isDeleted: true }))).toBe('update');
    expect(decideTallyWrite({ ...stored, isDeleted: true }, rec())).toBe('update');
  });

  it('the same AlterID with different data is a repair and is applied', () => {
    expect(decideTallyWrite(stored, rec({ data: { name: 'Sharma Traders', gstin: 'changed' } }))).toBe('update');
  });

  it('keeps only the newest copy when a batch repeats a record', () => {
    const out = newestPerRecord([rec({ alterId: 12 }), rec({ alterId: 11 }), rec({ guid: 'g-2' }), rec({ entity: 'group' })]);
    expect(out.map((r) => `${r.entity}|${r.guid}|${r.alterId}`)).toEqual(['ledger|g-1|12', 'ledger|g-2|10', 'group|g-1|10']);
  });
});
