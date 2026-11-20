import { describe, it, expect } from 'vitest';
import {
  COLLECTED_EDITABLE_FIELDS,
  collectedEditError,
  collectedInvoicePatch,
  invoiceEditDiff,
} from './invoice-edit-rules';

describe('what a collected invoice will accept', () => {
  it('opens exactly five fields, and no money among them', () => {
    expect([...COLLECTED_EDITABLE_FIELDS]).toEqual([
      'invoiceNumber',
      'invoiceDate',
      'dueDate',
      'collectedDate',
      'notes',
    ]);
  });

  it('builds the patch from the allowlist, ignoring anything else sent', () => {
    const patch = collectedInvoicePatch({
      invoiceNumber: 'TS/2026/014',
      collectedDate: '2026-11-18',
      // A caller trying its luck with the money.
      amount: 999999,
      currency: 'USD',
      projectId: 7,
    } as never);

    expect(patch).toEqual({
      invoiceNumber: 'TS/2026/014',
      invoiceDate: null,
      dueDate: null,
      collectedDate: '2026-11-18',
      notes: null,
    });
    expect(Object.keys(patch)).toHaveLength(5);
  });

  it('trims, and treats a cleared field as null', () => {
    const patch = collectedInvoicePatch({ invoiceNumber: '  TS/2026/014  ', notes: '   ', collectedDate: '2026-11-18' });
    expect(patch.invoiceNumber).toBe('TS/2026/014');
    expect(patch.notes).toBeNull();
  });
});

describe('the change log', () => {
  const before = {
    invoiceNumber: 'TS/2026/013',
    invoiceDate: '2026-10-31',
    dueDate: '2026-11-30',
    collectedDate: '2026-11-18',
    notes: null,
  };

  it('records only the fields that moved, with both values', () => {
    const changes = invoiceEditDiff(before, { ...before, invoiceNumber: 'TS/2026/014' });
    expect(changes).toEqual([{ field: 'invoiceNumber', before: 'TS/2026/013', after: 'TS/2026/014' }]);
  });

  it('logs nothing when a save changes nothing', () => {
    expect(invoiceEditDiff(before, { ...before })).toEqual([]);
  });

  // A form posts '' where the database holds NULL. Without this, every save
  // of an untouched invoice would log a change from null to ''.
  it('does not treat an empty string as a change from null', () => {
    expect(invoiceEditDiff(before, { ...before, notes: '' })).toEqual([]);
    expect(invoiceEditDiff(before, { ...before, notes: '   ' })).toEqual([]);
  });

  it('records a field being cleared', () => {
    const changes = invoiceEditDiff(before, { ...before, dueDate: '' });
    expect(changes).toEqual([{ field: 'dueDate', before: '2026-11-30', after: null }]);
  });

  it('records several changes in one save', () => {
    const changes = invoiceEditDiff(before, {
      ...before,
      invoiceNumber: 'TS/2026/014',
      collectedDate: '2026-11-19',
      notes: 'Re-issued with the corrected number',
    });
    expect(changes.map((c) => c.field)).toEqual(['invoiceNumber', 'collectedDate', 'notes']);
  });
});

describe('what a correction may not do', () => {
  const patch = {
    invoiceNumber: 'TS/2026/013',
    invoiceDate: '2026-10-31',
    dueDate: '2026-11-30',
    collectedDate: '2026-11-18',
    notes: null,
  };

  it('accepts a sound correction', () => {
    expect(collectedEditError(patch)).toBeNull();
  });

  // The status says it was paid; the record has to say when.
  it('refuses to clear the collected date', () => {
    expect(collectedEditError({ ...patch, collectedDate: null })).toMatch(/needs the date/i);
  });

  it('refuses a due date before the invoice date', () => {
    expect(collectedEditError({ ...patch, dueDate: '2026-10-01' })).toMatch(/due date is before/i);
  });

  it('refuses a collection dated before the invoice', () => {
    expect(collectedEditError({ ...patch, collectedDate: '2026-10-01' })).toMatch(/collected date is before/i);
  });

  it('allows the dates when the invoice date is not recorded at all', () => {
    expect(collectedEditError({ ...patch, invoiceDate: null, dueDate: '2026-01-01' })).toBeNull();
  });
});
