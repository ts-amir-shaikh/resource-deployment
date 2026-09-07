import type { Client } from '@libsql/client';
import { resourceSchema } from '../../lib/validations';
import {
  readCsv,
  checkHeaders,
  blankToUndefined,
  splitList,
  cleanNumber,
  validateRows,
  planActions,
  printReport,
  type Row,
} from './lib';

/** Unique key: email, case-insensitive — matches the DB's own unique constraint. */
const keyOf = (data: { email: string }) => data.email.trim().toLowerCase();

export async function importResources(
  client: Client,
  path: string,
  opts: { commit: boolean; update: boolean },
) {
  const rawRows = readCsv(path);
  checkHeaders(rawRows, ['name']);

  // Emails are generated, not read from the CSV: resource+1@techstalwarts.com,
  // resource+2@techstalwarts.com, … one per data row, in file order.
  // (rowNum is the spreadsheet row — 2 for the first data row — so rowNum - 1
  //  gives the 1-based sequence number.)
  const { valid, invalid } = validateRows(rawRows, resourceSchema, (raw: Row, rowNum: number) =>
    blankToUndefined({
      name: raw.name,
      email: `resource+${rowNum - 1}@techstalwarts.com`,
      mobile: raw.mobile,
      designation: raw.designation,
      currentCtc: cleanNumber(raw.currentCtc),
      revisedCtc: cleanNumber(raw.revisedCtc),
      revisedEffectiveFrom: raw.revisedEffectiveFrom,
      primarySkill: raw.primarySkill,
      secondarySkill: raw.secondarySkill,
      otherSkills: splitList(raw.otherSkills),
    }),
  );

  const existing = await client.execute('SELECT id, email FROM resources');
  const existingByKey = new Map(
    existing.rows.map((r) => [String(r.email).trim().toLowerCase(), Number(r.id)]),
  );

  const { actions, skipped, duplicates } = planActions(valid, existingByKey, keyOf, opts.update);
  const toCreate = actions.filter((a) => a.kind === 'create').length;
  const toUpdate = actions.filter((a) => a.kind === 'update').length;

  printReport({
    entity: 'Resources',
    totalRows: rawRows.length,
    invalid,
    duplicates,
    toCreate,
    toUpdate,
    toSkip: skipped.length,
    commit: opts.commit,
  });

  if (!opts.commit) return;

  for (const a of actions) {
    const otherSkills = JSON.stringify(a.data.otherSkills ?? []);
    if (a.kind === 'create') {
      await client.execute({
        sql: `INSERT INTO resources
                (name, email, mobile, designation, current_ctc, revised_ctc,
                 revised_effective_from, primary_skill, secondary_skill, other_skills)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          a.data.name,
          a.data.email,
          a.data.mobile ?? null,
          a.data.designation ?? null,
          a.data.currentCtc ?? null,
          a.data.revisedCtc ?? null,
          a.data.revisedEffectiveFrom ?? null,
          a.data.primarySkill ?? null,
          a.data.secondarySkill ?? null,
          otherSkills,
        ],
      });
    } else {
      await client.execute({
        sql: `UPDATE resources SET
                name = ?, mobile = ?, designation = ?, current_ctc = ?, revised_ctc = ?,
                revised_effective_from = ?, primary_skill = ?, secondary_skill = ?, other_skills = ?
              WHERE id = ?`,
        args: [
          a.data.name,
          a.data.mobile ?? null,
          a.data.designation ?? null,
          a.data.currentCtc ?? null,
          a.data.revisedCtc ?? null,
          a.data.revisedEffectiveFrom ?? null,
          a.data.primarySkill ?? null,
          a.data.secondarySkill ?? null,
          otherSkills,
          a.id,
        ],
      });
    }
  }
}
