/**
 * Reading a campaign's contact list (M69) — pure, and safe to import from
 * client components.
 *
 * Every rule here exists because of something in the three lists supplied on
 * 20 Nov 2026, not because it seemed prudent:
 *
 *   - 299 rows described 244 companies. A row is a *contact*; rows group by
 *     company into one prospect (D23).
 *   - 79 of 299 email cells and 44 phone cells read `NA`. Stored literally
 *     they would poison every "has an email" filter forever, so the sentinel
 *     set below reads as empty.
 *   - 60 email cells held two addresses. The first becomes the contact's; the
 *     cell is kept verbatim so nothing is silently dropped.
 *   - Three files, three header vocabularies, one with a different column
 *     order. Hence a mapping rather than a fixed template (D22).
 *   - One file carried 918 rows for 187 real ones. Blank rows are skipped in
 *     silence, not reported as errors.
 *
 * Duplicate matching is NOT reimplemented here: it goes through
 * normaliseCompanyName and findDuplicates, so an import cannot create a
 * company the Add Prospect form would have warned about.
 */
import { findDuplicates, normaliseCompanyName, type CompanyRecord } from './leadgen-rules';

/* ── Fields a column can be mapped to ──────────────────────── */

export const IMPORT_FIELDS = [
  'companyName',
  'contactName',
  'designation',
  'email',
  'mobile',
  'linkedin',
  'location',
  'insight',
  'remarks',
  'owner',
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  companyName: 'Company',
  contactName: 'Contact name',
  designation: 'Designation',
  email: 'Email',
  mobile: 'Mobile',
  linkedin: 'LinkedIn',
  location: 'Location',
  insight: 'Company insight',
  remarks: 'Remarks',
  owner: 'Assigned to',
};

/** Only these two make a row worth importing at all. */
export const REQUIRED_FIELDS: readonly ImportField[] = ['companyName', 'contactName'];

/**
 * Header spellings seen in the wild, lower-cased and stripped of punctuation.
 * Longest match wins, so "contact name" maps to the person and not to the
 * phone number that "contact no" means.
 */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  companyName: ['company', 'company name', 'organisation', 'organization', 'account', 'firm'],
  contactName: ['full name', 'name', 'contact name', 'contact person', 'person'],
  designation: ['job title', 'designation', 'title', 'role', 'position'],
  email: ['email id', 'email', 'email address', 'e mail', 'mail id', 'mail'],
  mobile: ['contact no', 'contact number', 'mobile', 'mobile no', 'phone', 'phone no', 'contact'],
  linkedin: ['linkedin url', 'linkedin', 'linkedin profile', 'li url'],
  location: ['location', 'city', 'country', 'region', 'geo'],
  insight: ['insight', 'insights', 'about', 'company insight', 'description'],
  remarks: ['remarks', 'remark', 'comment', 'comments', 'note', 'notes'],
  owner: ['assigned to', 'assigned', 'owner', 'sdr', 'rep'],
};

function headerKey(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Best guess at which column is which, by header. Each field takes at most
 * one column and each column at most one field; an unrecognised header is
 * simply left unmapped for the operator to set by hand.
 */
export function autoMapHeaders(headers: readonly string[]): Record<number, ImportField> {
  const keys = headers.map(headerKey);
  const mapping: Record<number, ImportField> = {};
  const taken = new Set<ImportField>();

  // Longest alias first, so "contact name" is considered before "contact".
  const candidates: { field: ImportField; alias: string }[] = [];
  for (const field of IMPORT_FIELDS) {
    for (const alias of HEADER_ALIASES[field]) candidates.push({ field, alias });
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);

  for (const { field, alias } of candidates) {
    if (taken.has(field)) continue;
    const index = keys.findIndex((k, i) => k === alias && mapping[i] === undefined);
    if (index >= 0) {
      mapping[index] = field;
      taken.add(field);
    }
  }
  return mapping;
}

/* ── Cell cleaning ─────────────────────────────────────────── */

/**
 * What these lists write where they mean nothing. Kept as whole-cell matches:
 * a company genuinely called "NA Holdings" must survive.
 */
const NULL_SENTINELS = new Set(['na', 'n/a', 'n.a.', '-', '--', '–', '—', 'nil', 'none', 'null', 'tbd', '?']);

export function cleanCell(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  return NULL_SENTINELS.has(value.toLowerCase()) ? '' : value;
}

/**
 * Addresses in a cell that may hold several, separated by commas, semicolons,
 * slashes or just spaces. Order is kept: the first is the one that gets used.
 */
export function splitEmails(raw: string | undefined): string[] {
  const cleaned = cleanCell(raw);
  if (!cleaned) return [];
  return cleaned
    .split(/[\s,;/|]+/)
    .map((p) => p.trim().replace(/^[<(]|[>)]$/g, ''))
    .filter((p) => p.includes('@') && p.length > 2);
}

/* ── Rows ──────────────────────────────────────────────────── */

export type ParsedContact = {
  /** 1-based line in the file, counting the header, so it matches the sheet. */
  rowNumber: number;
  companyName: string;
  name: string;
  designation: string | null;
  email: string | null;
  mobile: string | null;
  linkedin: string | null;
  location: string | null;
  insight: string | null;
  /** Remarks, plus the raw email cell when it held more than one address. */
  notes: string | null;
  owner: string | null;
  /** Why this row cannot be imported; empty when it can. */
  errors: string[];
};

/** The column a field was mapped to, or -1 when the operator left it unset. */
export function columnOf(mapping: Record<number, ImportField>, field: ImportField): number {
  for (const [index, mapped] of Object.entries(mapping)) {
    if (mapped === field) return Number(index);
  }
  return -1;
}

function cell(row: readonly string[], mapping: Record<number, ImportField>, field: ImportField): string {
  const index = columnOf(mapping, field);
  return index < 0 ? '' : cleanCell(row[index]);
}

function orNull(value: string): string | null {
  return value === '' ? null : value;
}

/** True when every cell is blank — a trailing row, not a mistake. */
export function isBlankRow(row: readonly string[]): boolean {
  return row.every((c) => (c ?? '').trim() === '');
}

export function parseRows(
  body: readonly (readonly string[])[],
  mapping: Record<number, ImportField>,
  /** The first body row's line number in the file. Normally 2. */
  firstLine = 2,
): ParsedContact[] {
  const out: ParsedContact[] = [];
  const emailColumn = columnOf(mapping, 'email');

  body.forEach((row, i) => {
    if (isBlankRow(row)) return;

    const rawEmailCell = emailColumn < 0 ? '' : cleanCell(row[emailColumn]);
    const emails = splitEmails(rawEmailCell);
    const remarks = cell(row, mapping, 'remarks');

    // Only when the cell held more than one address: a note saying "the email
    // was a@b.com" on every second row would be noise, not a record.
    const extra = emails.length > 1 ? `Email cell held: ${rawEmailCell}` : '';
    const notes = [remarks, extra].filter(Boolean).join(' · ');

    const companyName = cell(row, mapping, 'companyName');
    const name = cell(row, mapping, 'contactName');

    const errors: string[] = [];
    if (!companyName) errors.push('No company name');
    if (!name) errors.push('No contact name');

    out.push({
      rowNumber: firstLine + i,
      companyName,
      name,
      designation: orNull(cell(row, mapping, 'designation')),
      email: emails[0] ?? null,
      mobile: orNull(cell(row, mapping, 'mobile')),
      linkedin: orNull(cell(row, mapping, 'linkedin')),
      location: orNull(cell(row, mapping, 'location')),
      insight: orNull(cell(row, mapping, 'insight')),
      notes: orNull(notes),
      owner: orNull(cell(row, mapping, 'owner')),
      errors,
    });
  });

  return out;
}

/* ── The plan ──────────────────────────────────────────────── */

export type ExistingContact = { prospectId: number; name: string; email: string | null };

export type ContactAction = 'create' | 'skip' | 'error';
export type CompanyAction = 'create' | 'existing' | 'client' | 'error';

export type PlannedContact = ParsedContact & {
  action: ContactAction;
  reason: string | null;
};

export type PlannedCompany = {
  key: string;
  companyName: string;
  action: CompanyAction;
  /** The prospect these contacts attach to, when one already exists. */
  prospectId: number | null;
  /** What the name matched, for the operator to see. */
  matches: CompanyRecord[];
  location: string | null;
  insight: string | null;
  owner: string | null;
  contacts: PlannedContact[];
};

export type ImportPlan = {
  companies: PlannedCompany[];
  counts: {
    rows: number;
    companiesCreated: number;
    companiesMatched: number;
    contactsCreated: number;
    contactsSkipped: number;
    rowsFailed: number;
  };
};

function sameContact(a: { name: string; email: string | null }, b: { name: string; email: string | null }): boolean {
  // Email is the stronger signal and the one these lists carry most often;
  // the name is the fallback for the 79 rows that have no address at all.
  if (a.email && b.email) return a.email.toLowerCase() === b.email.toLowerCase();
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase();
}

/**
 * What an import would do, without doing any of it (D29). `updateExisting`
 * mirrors the CLI importer's --update: without it a contact already on the
 * prospect is left exactly as it is.
 */
export function planImport(
  parsed: readonly ParsedContact[],
  existing: {
    prospects: readonly CompanyRecord[];
    clients: readonly CompanyRecord[];
    contacts: readonly ExistingContact[];
  },
  options: { updateExisting?: boolean } = {},
): ImportPlan {
  const byKey = new Map<string, PlannedCompany>();
  const all = [...existing.prospects, ...existing.clients];

  for (const row of parsed) {
    const key = normaliseCompanyName(row.companyName);

    if (row.errors.length > 0 || !key) {
      // A row with no usable company still has to appear in the preview, or
      // the operator is told "187 rows" and shown 186.
      const bucket = byKey.get(`!error:${row.rowNumber}`) ?? {
        key: `!error:${row.rowNumber}`,
        companyName: row.companyName || '(no company)',
        action: 'error' as CompanyAction,
        prospectId: null,
        matches: [],
        location: null,
        insight: null,
        owner: null,
        contacts: [],
      };
      bucket.contacts.push({
        ...row,
        action: 'error',
        reason: row.errors.join('; ') || 'Company name is empty once punctuation is removed',
      });
      byKey.set(bucket.key, bucket);
      continue;
    }

    let company = byKey.get(key);
    if (!company) {
      const matches = findDuplicates(row.companyName, all);
      const client = matches.find((m) => m.kind === 'client');
      const prospect = matches.find((m) => m.kind === 'prospect');
      company = {
        key,
        companyName: row.companyName,
        // An existing client is not a prospect to be re-created. It is said
        // plainly and left alone; whoever runs the import decides.
        action: client ? 'client' : prospect ? 'existing' : 'create',
        prospectId: prospect?.id ?? null,
        matches,
        location: row.location,
        insight: row.insight,
        owner: row.owner,
        contacts: [],
      };
      byKey.set(key, company);
    } else {
      // Later rows fill in what the first one left blank.
      company.location ??= row.location;
      company.insight ??= row.insight;
      company.owner ??= row.owner;
    }

    const onProspect = company.prospectId
      ? existing.contacts.filter((c) => c.prospectId === company!.prospectId)
      : [];
    const alreadyThere = onProspect.find((c) => sameContact(c, row));
    const alreadyInFile = company.contacts.find((c) => c.action === 'create' && sameContact(c, row));

    let action: ContactAction = 'create';
    let reason: string | null = null;
    if (company.action === 'client') {
      action = 'skip';
      reason = `${company.matches.find((m) => m.kind === 'client')?.name ?? 'This company'} is already a client`;
    } else if (alreadyInFile) {
      action = 'skip';
      reason = `Same person as row ${alreadyInFile.rowNumber}`;
    } else if (alreadyThere && !options.updateExisting) {
      action = 'skip';
      reason = 'Already a contact on this prospect';
    }

    company.contacts.push({ ...row, action, reason });
  }

  const companies = [...byKey.values()];
  return {
    companies,
    counts: {
      rows: parsed.length,
      companiesCreated: companies.filter((c) => c.action === 'create').length,
      companiesMatched: companies.filter((c) => c.action === 'existing').length,
      contactsCreated: companies.reduce((n, c) => n + c.contacts.filter((x) => x.action === 'create').length, 0),
      contactsSkipped: companies.reduce((n, c) => n + c.contacts.filter((x) => x.action === 'skip').length, 0),
      rowsFailed: companies.reduce((n, c) => n + c.contacts.filter((x) => x.action === 'error').length, 0),
    },
  };
}
