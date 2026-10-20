import { describe, expect, it } from 'vitest';
import { csvCell, toCsv, type ExportColumn } from './csv';

describe('csvCell', () => {
  it('writes nulls as empty cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('Pune, MH')).toBe('"Pune, MH"');
    expect(csvCell('the "best"')).toBe('"the ""best"""');
    expect(csvCell('line one\nline two')).toBe('"line one\nline two"');
  });

  it('defuses formulas (AE4)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+91 98200')).toBe("'+91 98200");
    expect(csvCell('@sum')).toBe("'@sum");
    expect(csvCell('-cmd')).toBe("'-cmd");
  });

  it('leaves numbers and negative numeric text alone', () => {
    expect(csvCell(-1200.5)).toBe('-1200.5');
    expect(csvCell('-42')).toBe('-42');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('writes booleans as Yes / No', () => {
    expect(csvCell(true)).toBe('Yes');
    expect(csvCell(false)).toBe('No');
  });
});

describe('toCsv', () => {
  type Row = { name: string; ctc: number | null };
  const cols: ExportColumn<Row>[] = [
    { key: 'name', label: 'Name', value: (r) => r.name },
    { key: 'ctc', label: 'CTC (₹)', value: (r) => r.ctc },
  ];

  it('starts with a BOM and a header row, CRLF throughout', () => {
    const out = toCsv(cols, [
      { name: 'Asha', ctc: 1200000 },
      { name: 'Ravi, Jr', ctc: null },
    ]);
    expect(out).toBe('﻿Name,CTC (₹)\r\nAsha,1200000\r\n"Ravi, Jr",\r\n');
  });

  it('writes only the header for no rows', () => {
    expect(toCsv(cols, [])).toBe('﻿Name,CTC (₹)\r\n');
  });
});
