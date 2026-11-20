/**
 * What may still be corrected on a collected invoice (M70) — pure, and safe
 * to import from client components.
 *
 * A collected invoice is a record of what was billed and what was paid, so
 * the money on it is fixed: amount, GST, currency, FX rate, the period, the
 * project, the agreement, the scope and every resource line stay as raised.
 * What is not fixed is the clerical surface around it — the number Accounts
 * typed in, the three dates, and the notes. Those are wrong often enough
 * (a number transposed, a payment credited on the wrong day) that the only
 * alternative, voiding and re-raising a paid invoice, was worse.
 *
 * D26: because this opens an audit record, every change is written to
 * invoice_edits field by field, with its before and after.
 */

/** The only columns a collected invoice will accept a change to (D25). */
export const COLLECTED_EDITABLE_FIELDS = [
  'invoiceNumber',
  'invoiceDate',
  'dueDate',
  'collectedDate',
  'notes',
] as const;

export type CollectedEditableField = (typeof COLLECTED_EDITABLE_FIELDS)[number];

/** Human labels, used by the edit history and the form. */
export const COLLECTED_FIELD_LABELS: Record<CollectedEditableField, string> = {
  invoiceNumber: 'Invoice number',
  invoiceDate: 'Invoice date',
  dueDate: 'Due date',
  collectedDate: 'Collected date',
  notes: 'Notes',
};

export type FieldChange = {
  field: CollectedEditableField;
  before: string | null;
  after: string | null;
};

type Editable = Partial<Record<CollectedEditableField, string | null | undefined>>;

/**
 * Empty and absent are the same thing here. A form posts '' for a cleared
 * field while the database holds NULL, and without this every save of an
 * untouched invoice would log five changes from null to ''.
 */
function normalise(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The fields that actually moved. Returning the changes rather than a boolean
 * means the caller writes the log and decides whether there is anything to
 * write from the same answer.
 */
export function invoiceEditDiff(before: Editable, after: Editable): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of COLLECTED_EDITABLE_FIELDS) {
    const from = normalise(before[field]);
    const to = normalise(after[field]);
    if (from !== to) changes.push({ field, before: from, after: to });
  }
  return changes;
}

/**
 * The patch to apply, built from the allowlist rather than by spreading the
 * request body. A spread would write whatever a caller sent the moment
 * someone adds a column to the schema — the same reason public response
 * shapes here are allowlists and never delete-lists.
 */
export function collectedInvoicePatch(input: Editable): Record<CollectedEditableField, string | null> {
  return {
    invoiceNumber: normalise(input.invoiceNumber),
    invoiceDate: normalise(input.invoiceDate),
    dueDate: normalise(input.dueDate),
    collectedDate: normalise(input.collectedDate),
    notes: normalise(input.notes),
  };
}

/**
 * Why a correction is refused, or null when it is fine. A collected invoice
 * has been paid, so it must carry the date it was paid on; clearing it would
 * leave the status and the record disagreeing.
 */
export function collectedEditError(patch: Record<CollectedEditableField, string | null>): string | null {
  if (!patch.collectedDate) return 'A collected invoice needs the date it was collected on';
  if (patch.invoiceDate && patch.dueDate && patch.dueDate < patch.invoiceDate) {
    return 'The due date is before the invoice date';
  }
  if (patch.invoiceDate && patch.collectedDate < patch.invoiceDate) {
    return 'The collected date is before the invoice date';
  }
  return null;
}
