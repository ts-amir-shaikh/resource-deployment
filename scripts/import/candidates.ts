import type { Client } from '@libsql/client';
import { candidateSchema } from '../../lib/validations';
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

/** Prefer email; a candidate with none is keyed by name+mobile as a best effort. */
const keyOf = (data: { email?: string; name: string; mobile?: string }) =>
  data.email
    ? `email:${data.email.trim().toLowerCase()}`
    : `namemobile:${data.name.trim().toLowerCase()}::${(data.mobile ?? '').trim()}`;

export async function importCandidates(
  client: Client,
  path: string,
  opts: { commit: boolean; update: boolean },
) {
  const rawRows = readCsv(path);
  checkHeaders(rawRows, ['name', 'source']);

  const resourceRows = await client.execute('SELECT id, email FROM resources');
  const resourceIdByEmail = new Map(
    resourceRows.rows.map((r) => [String(r.email).trim().toLowerCase(), Number(r.id)]),
  );

  const { valid, invalid } = validateRows(rawRows, candidateSchema, (raw: Row) => {
    let resourceId: string | undefined;
    const resourceEmail = (raw.resourceEmail ?? '').trim();
    if (resourceEmail) {
      const found = resourceIdByEmail.get(resourceEmail.toLowerCase());
      if (!found) {
        return {
          __error: `resourceEmail: no resource with email "${resourceEmail}" — leave blank for a candidate not yet on the bench`,
        };
      }
      resourceId = String(found);
    }

    return blankToUndefined({
      name: raw.name,
      email: raw.email,
      mobile: raw.mobile,
      currentDesignation: raw.currentDesignation,
      experienceYears: cleanNumber(raw.experienceYears),
      primarySkill: raw.primarySkill,
      secondarySkill: raw.secondarySkill,
      otherSkills: splitList(raw.otherSkills),
      currentCtc: cleanNumber(raw.currentCtc),
      expectedCtc: cleanNumber(raw.expectedCtc),
      noticePeriodDays: cleanNumber(raw.noticePeriodDays),
      location: raw.location,
      source: raw.source,
      sourceName: raw.sourceName,
      resourceId,
    });
  });

  const existing = await client.execute('SELECT id, email, name, mobile FROM candidates');
  const existingByKey = new Map(
    existing.rows.map((r) => [
      r.email
        ? `email:${String(r.email).trim().toLowerCase()}`
        : `namemobile:${String(r.name).trim().toLowerCase()}::${(r.mobile ? String(r.mobile) : '').trim()}`,
      Number(r.id),
    ]),
  );

  const { actions, skipped, duplicates } = planActions(valid, existingByKey, keyOf, opts.update);
  const toCreate = actions.filter((a) => a.kind === 'create').length;
  const toUpdate = actions.filter((a) => a.kind === 'update').length;

  printReport({
    entity: 'Candidates',
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
    const d = a.data;
    const otherSkills = JSON.stringify(d.otherSkills ?? []);
    if (a.kind === 'create') {
      await client.execute({
        sql: `INSERT INTO candidates
                (resource_id, name, email, mobile, current_designation, experience_years,
                 primary_skill, secondary_skill, other_skills, current_ctc, expected_ctc,
                 notice_period_days, location, source, source_name, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          d.resourceId ?? null,
          d.name,
          d.email ?? null,
          d.mobile ?? null,
          d.currentDesignation ?? null,
          d.experienceYears ?? null,
          d.primarySkill ?? null,
          d.secondarySkill ?? null,
          otherSkills,
          d.currentCtc ?? null,
          d.expectedCtc ?? null,
          d.noticePeriodDays ?? null,
          d.location ?? null,
          d.source,
          d.sourceName ?? null,
          d.notes ?? null,
        ],
      });
    } else {
      await client.execute({
        sql: `UPDATE candidates SET
                resource_id = ?, mobile = ?, current_designation = ?, experience_years = ?,
                primary_skill = ?, secondary_skill = ?, other_skills = ?, current_ctc = ?,
                expected_ctc = ?, notice_period_days = ?, location = ?, source = ?,
                source_name = ?, notes = ?
              WHERE id = ?`,
        args: [
          d.resourceId ?? null,
          d.mobile ?? null,
          d.currentDesignation ?? null,
          d.experienceYears ?? null,
          d.primarySkill ?? null,
          d.secondarySkill ?? null,
          otherSkills,
          d.currentCtc ?? null,
          d.expectedCtc ?? null,
          d.noticePeriodDays ?? null,
          d.location ?? null,
          d.source,
          d.sourceName ?? null,
          d.notes ?? null,
          a.id,
        ],
      });
    }
  }
}
