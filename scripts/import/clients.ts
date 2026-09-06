import type { Client } from '@libsql/client';
import { clientSchema } from '../../lib/validations';
import {
  readCsv,
  checkHeaders,
  blankToUndefined,
  validateRows,
  planActions,
  printReport,
  type Row,
} from './lib';

/** Unique key: company name, case-insensitive. */
const keyOf = (data: { companyName: string }) => data.companyName.trim().toLowerCase();

export async function importClients(
  client: Client,
  path: string,
  opts: { commit: boolean; update: boolean },
) {
  const rawRows = readCsv(path);
  checkHeaders(rawRows, ['companyName']);

  const { valid, invalid } = validateRows(rawRows, clientSchema, (raw: Row) =>
    blankToUndefined({
      companyName: raw.companyName,
      spocName: raw.spocName,
      spocEmail: raw.spocEmail,
      spocMobile: raw.spocMobile,
      spocDesignation: raw.spocDesignation,
      accountName: raw.accountName,
      accountEmail: raw.accountEmail,
      accountMobile: raw.accountMobile,
      altSpocName: raw.altSpocName,
      altSpocEmail: raw.altSpocEmail,
      altSpocMobile: raw.altSpocMobile,
      altSpocDesignation: raw.altSpocDesignation,
    }),
  );

  const existing = await client.execute('SELECT id, company_name FROM clients');
  const existingByKey = new Map(
    existing.rows.map((r) => [String(r.company_name).trim().toLowerCase(), Number(r.id)]),
  );

  const { actions, skipped, duplicates } = planActions(valid, existingByKey, keyOf, opts.update);
  const toCreate = actions.filter((a) => a.kind === 'create').length;
  const toUpdate = actions.filter((a) => a.kind === 'update').length;

  printReport({
    entity: 'Clients',
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
    if (a.kind === 'create') {
      await client.execute({
        sql: `INSERT INTO clients
                (company_name, spoc_name, spoc_email, spoc_mobile, spoc_designation,
                 account_name, account_email, account_mobile,
                 alt_spoc_name, alt_spoc_email, alt_spoc_mobile, alt_spoc_designation)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          d.companyName,
          d.spocName ?? null,
          d.spocEmail ?? null,
          d.spocMobile ?? null,
          d.spocDesignation ?? null,
          d.accountName ?? null,
          d.accountEmail ?? null,
          d.accountMobile ?? null,
          d.altSpocName ?? null,
          d.altSpocEmail ?? null,
          d.altSpocMobile ?? null,
          d.altSpocDesignation ?? null,
        ],
      });
    } else {
      await client.execute({
        sql: `UPDATE clients SET
                spoc_name = ?, spoc_email = ?, spoc_mobile = ?, spoc_designation = ?,
                account_name = ?, account_email = ?, account_mobile = ?,
                alt_spoc_name = ?, alt_spoc_email = ?, alt_spoc_mobile = ?, alt_spoc_designation = ?
              WHERE id = ?`,
        args: [
          d.spocName ?? null,
          d.spocEmail ?? null,
          d.spocMobile ?? null,
          d.spocDesignation ?? null,
          d.accountName ?? null,
          d.accountEmail ?? null,
          d.accountMobile ?? null,
          d.altSpocName ?? null,
          d.altSpocEmail ?? null,
          d.altSpocMobile ?? null,
          d.altSpocDesignation ?? null,
          a.id,
        ],
      });
    }
  }
}
