import { describe, it, expect } from 'vitest';
import {
  autoMapHeaders,
  cleanCell,
  isBlankRow,
  parseRows,
  planImport,
  splitEmails,
  type ImportField,
} from './leadgen-import';

/*
 * The three header rows that prompted the mapping decision (D22), verbatim
 * from the lists supplied on 20 Nov 2026.
 */
const REAL_ESTATE = ['Full Name', 'Job Title', 'Company', 'Location', 'Contact No', 'Email ID', 'LinkedIn URL'];
const SEAMLESS = ['Name', 'Company', 'Designation', 'Contact No', 'Email ID', 'LinkedIn URL'];
const SOFIYA = [
  'Company', 'Name', 'Designation', 'Contact No', 'Email ID', 'LinkedIn URL',
  'Insight', 'Location', 'Assigned to', 'Remarks',
];

function mapped(headers: string[]): Record<string, ImportField> {
  const m = autoMapHeaders(headers);
  return Object.fromEntries(Object.entries(m).map(([i, f]) => [headers[Number(i)], f]));
}

describe('matching columns to fields', () => {
  it('reads the Real Estate list, where the person comes first', () => {
    expect(mapped(REAL_ESTATE)).toEqual({
      'Full Name': 'contactName',
      'Job Title': 'designation',
      Company: 'companyName',
      Location: 'location',
      'Contact No': 'mobile',
      'Email ID': 'email',
      'LinkedIn URL': 'linkedin',
    });
  });

  it('reads the Seamless list, with its different vocabulary', () => {
    expect(mapped(SEAMLESS)).toEqual({
      Name: 'contactName',
      Company: 'companyName',
      Designation: 'designation',
      'Contact No': 'mobile',
      'Email ID': 'email',
      'LinkedIn URL': 'linkedin',
    });
  });

  it('reads the Sofiya list, where the company comes first and there are extras', () => {
    expect(mapped(SOFIYA)).toEqual({
      Company: 'companyName',
      Name: 'contactName',
      Designation: 'designation',
      'Contact No': 'mobile',
      'Email ID': 'email',
      'LinkedIn URL': 'linkedin',
      Insight: 'insight',
      Location: 'location',
      'Assigned to': 'owner',
      Remarks: 'remarks',
    });
  });

  // "Contact No" and "Contact Name" differ by one word; the longer alias wins.
  it('does not mistake the contact name for the phone number', () => {
    expect(mapped(['Contact Name', 'Contact No'])).toEqual({
      'Contact Name': 'contactName',
      'Contact No': 'mobile',
    });
  });

  it('leaves an unrecognised header unmapped rather than guessing', () => {
    const m = autoMapHeaders(['Company', 'Name', 'Lead Score']);
    expect(m[2]).toBeUndefined();
  });

  it('gives a field to only one column when a header repeats', () => {
    const m = autoMapHeaders(['Company', 'Company']);
    expect(Object.values(m).filter((f) => f === 'companyName')).toHaveLength(1);
  });
});

describe('cells that say nothing', () => {
  it('treats the sentinels these lists use as empty', () => {
    for (const v of ['NA', 'na', 'N/A', '-', '—', 'nil', 'None', 'TBD']) {
      expect(cleanCell(v)).toBe('');
    }
  });

  // 79 of 299 email cells said NA. Stored literally they would answer "yes"
  // to every "has an email" filter from here on.
  it('keeps a real value that merely contains those letters', () => {
    expect(cleanCell('NA Holdings')).toBe('NA Holdings');
    expect(cleanCell('  Anarock  ')).toBe('Anarock');
  });

  it('knows a trailing blank row from a real one', () => {
    expect(isBlankRow(['', '  ', ''])).toBe(true);
    expect(isBlankRow(['', 'Anarock', ''])).toBe(false);
  });
});

describe('cells holding more than one address', () => {
  it('splits on a comma, keeping the first', () => {
    expect(splitEmails('junaid.khan@purehealth.ae , khanjh@hotmail.com')).toEqual([
      'junaid.khan@purehealth.ae',
      'khanjh@hotmail.com',
    ]);
  });

  it('splits on semicolons, slashes and bare spaces too', () => {
    expect(splitEmails('a@b.com; c@d.com / e@f.com g@h.com')).toHaveLength(4);
  });

  it('returns nothing for NA, and nothing for a cell with no address in it', () => {
    expect(splitEmails('NA')).toEqual([]);
    expect(splitEmails('ask reception')).toEqual([]);
  });
});

describe('reading rows', () => {
  const mapping = autoMapHeaders(SOFIYA);
  const row = [
    'Mangal Keshav Financial Services LLP', 'Chintan Bhagat', 'Chief Executive Officer',
    '+91 99204 20000', 'chintanbhagat@mangalkeshav.com', 'https://www.linkedin.com/in/chintan-bh',
    'Mangal Keshav is a financial services firm', 'Dubai, United Arab Emirates', '', '',
  ];

  it('pulls a complete row apart', () => {
    const [parsed] = parseRows([row], mapping);
    expect(parsed).toMatchObject({
      rowNumber: 2,
      companyName: 'Mangal Keshav Financial Services LLP',
      name: 'Chintan Bhagat',
      designation: 'Chief Executive Officer',
      email: 'chintanbhagat@mangalkeshav.com',
      location: 'Dubai, United Arab Emirates',
      owner: null,
      errors: [],
    });
  });

  it('numbers rows as the spreadsheet does, counting the header', () => {
    const rows = parseRows([row, row, row], mapping);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 3, 4]);
  });

  // The Real Estate file carried 918 rows for 187 real ones.
  it('skips trailing blank rows without numbering them', () => {
    const rows = parseRows([row, ['', '', '', '', '', '', '', '', '', ''], row], mapping);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rowNumber)).toEqual([2, 4]);
  });

  it('keeps the whole email cell in the notes when it held two addresses', () => {
    const two = [...row];
    two[4] = 'a@b.com , c@d.com';
    const [parsed] = parseRows([two], mapping);
    expect(parsed.email).toBe('a@b.com');
    expect(parsed.notes).toContain('a@b.com , c@d.com');
  });

  it('adds no note when the cell held exactly one address', () => {
    expect(parseRows([row], mapping)[0].notes).toBeNull();
  });

  it('turns NA into nothing', () => {
    const na = [...row];
    na[3] = 'NA';
    na[4] = 'NA';
    const [parsed] = parseRows([na], mapping);
    expect(parsed.mobile).toBeNull();
    expect(parsed.email).toBeNull();
  });

  it('faults a row with no company or no person', () => {
    const noCompany = [...row];
    noCompany[0] = '';
    expect(parseRows([noCompany], mapping)[0].errors).toContain('No company name');

    const noName = [...row];
    noName[1] = '';
    expect(parseRows([noName], mapping)[0].errors).toContain('No contact name');
  });
});

describe('planning what an import would do', () => {
  const mapping = autoMapHeaders(SEAMLESS);
  const empty = { prospects: [], clients: [], contacts: [] };

  function rows(...people: [string, string, string][]) {
    return parseRows(
      people.map(([name, company, email]) => [name, company, 'CTO', '+971 50 000 0000', email, '']),
      mapping,
    );
  }

  // 299 rows described 244 companies: Prestige Group appeared six times.
  it('groups rows by company into one prospect', () => {
    const plan = planImport(
      rows(
        ['Asha R', 'Prestige Group', 'asha@prestige.in'],
        ['Vikram S', 'Prestige Group', 'vikram@prestige.in'],
        ['Neha P', 'Anarock', 'neha@anarock.com'],
      ),
      empty,
    );
    expect(plan.counts.companiesCreated).toBe(2);
    expect(plan.counts.contactsCreated).toBe(3);
    expect(plan.companies.find((c) => c.companyName === 'Prestige Group')!.contacts).toHaveLength(2);
  });

  it('groups through the same normalisation the Add Prospect form uses', () => {
    const plan = planImport(
      rows(['A B', 'Prestige Group Pvt. Ltd.', 'a@p.in'], ['C D', 'Prestige Group', 'c@p.in']),
      empty,
    );
    expect(plan.counts.companiesCreated).toBe(1);
  });

  it('attaches to a prospect that already exists instead of making a second', () => {
    const plan = planImport(rows(['Asha R', 'Prestige Group', 'asha@prestige.in']), {
      prospects: [{ kind: 'prospect', id: 7, name: 'Prestige Group Ltd' }],
      clients: [],
      contacts: [],
    });
    expect(plan.companies[0].action).toBe('existing');
    expect(plan.companies[0].prospectId).toBe(7);
    expect(plan.counts.companiesCreated).toBe(0);
    expect(plan.counts.companiesMatched).toBe(1);
  });

  // A company we already bill is not a prospect to be created again.
  it('leaves an existing client alone and says why', () => {
    const plan = planImport(rows(['Asha R', 'Anarock', 'asha@anarock.com']), {
      prospects: [],
      clients: [{ kind: 'client', id: 3, name: 'Anarock' }],
      contacts: [],
    });
    expect(plan.companies[0].action).toBe('client');
    expect(plan.companies[0].contacts[0].action).toBe('skip');
    expect(plan.companies[0].contacts[0].reason).toContain('already a client');
  });

  it('skips a contact already on the prospect (D29)', () => {
    const plan = planImport(rows(['Asha R', 'Prestige Group', 'asha@prestige.in']), {
      prospects: [{ kind: 'prospect', id: 7, name: 'Prestige Group' }],
      clients: [],
      contacts: [{ prospectId: 7, name: 'Asha Raman', email: 'asha@prestige.in' }],
    });
    expect(plan.companies[0].contacts[0].action).toBe('skip');
    expect(plan.counts.contactsCreated).toBe(0);
  });

  it('takes the email as the match even when the name is spelled differently', () => {
    const plan = planImport(rows(['A. Raman', 'Prestige Group', 'asha@prestige.in']), {
      prospects: [{ kind: 'prospect', id: 7, name: 'Prestige Group' }],
      clients: [],
      contacts: [{ prospectId: 7, name: 'Asha Raman', email: 'ASHA@prestige.in' }],
    });
    expect(plan.companies[0].contacts[0].action).toBe('skip');
  });

  it('falls back to the name for the rows that carry no address', () => {
    const plan = planImport(rows(['Asha Raman', 'Prestige Group', 'NA']), {
      prospects: [{ kind: 'prospect', id: 7, name: 'Prestige Group' }],
      clients: [],
      contacts: [{ prospectId: 7, name: 'asha raman', email: null }],
    });
    expect(plan.companies[0].contacts[0].action).toBe('skip');
  });

  it('creates it anyway when the operator asks for existing rows to be updated', () => {
    const plan = planImport(
      rows(['Asha R', 'Prestige Group', 'asha@prestige.in']),
      {
        prospects: [{ kind: 'prospect', id: 7, name: 'Prestige Group' }],
        clients: [],
        contacts: [{ prospectId: 7, name: 'Asha Raman', email: 'asha@prestige.in' }],
      },
      { updateExisting: true },
    );
    expect(plan.companies[0].contacts[0].action).toBe('create');
  });

  it('collapses the same person listed twice in one file', () => {
    const plan = planImport(
      rows(['Asha R', 'Prestige Group', 'asha@prestige.in'], ['Asha R', 'Prestige Group', 'asha@prestige.in']),
      empty,
    );
    expect(plan.counts.contactsCreated).toBe(1);
    expect(plan.counts.contactsSkipped).toBe(1);
    expect(plan.companies[0].contacts[1].reason).toContain('row 2');
  });

  // Told "187 rows" and shown 186 is how an import loses people quietly.
  it('keeps a faulty row in the preview rather than dropping it', () => {
    const plan = planImport(rows(['Asha R', '', 'asha@x.com'], ['Neha P', 'Anarock', 'neha@anarock.com']), empty);
    expect(plan.counts.rows).toBe(2);
    expect(plan.counts.rowsFailed).toBe(1);
    expect(plan.counts.contactsCreated).toBe(1);
  });

  it('faults a company name that is nothing but punctuation', () => {
    const plan = planImport(rows(['Asha R', '!!!', 'asha@x.com']), empty);
    expect(plan.counts.rowsFailed).toBe(1);
  });

  it('takes the company details from whichever row first carries them', () => {
    const plan = planImport(
      parseRows(
        [
          ['Asha R', 'Prestige Group', 'CTO', '', '', ''],
          ['Vikram S', 'Prestige Group', 'CEO', '', '', ''],
        ],
        autoMapHeaders(SEAMLESS),
      ),
      empty,
    );
    expect(plan.companies[0].contacts).toHaveLength(2);
  });
});
