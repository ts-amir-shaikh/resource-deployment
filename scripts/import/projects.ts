import type { Client } from '@libsql/client';
import { projectSchema } from '../../lib/validations';
import {
  readCsv,
  checkHeaders,
  blankToUndefined,
  validateRows,
  planActions,
  printReport,
  type Row,
} from './lib';

/** Unique key: (clientId, projectName) — two clients may share a project name. */
const keyOf = (data: { clientId: number; projectName: string }) =>
  `${data.clientId}::${data.projectName.trim().toLowerCase()}`;

export async function importProjects(
  client: Client,
  path: string,
  opts: { commit: boolean; update: boolean },
) {
  const rawRows = readCsv(path);
  checkHeaders(rawRows, ['clientName', 'projectName']);

  const clientRows = await client.execute('SELECT id, company_name FROM clients');
  const clientIdByName = new Map(
    clientRows.rows.map((r) => [String(r.company_name).trim().toLowerCase(), Number(r.id)]),
  );

  const { valid, invalid } = validateRows(rawRows, projectSchema, (raw: Row) => {
    const name = (raw.clientName ?? '').trim();
    const clientId = clientIdByName.get(name.toLowerCase());
    if (!clientId) {
      return {
        __error: `clientName: no client named "${name}" — import clients first, or check spelling`,
      };
    }
    return blankToUndefined({
      clientId: String(clientId),
      projectName: raw.projectName,
      managerName: raw.managerName,
      managerEmail: raw.managerEmail,
      managerMobile: raw.managerMobile,
      managerDesignation: raw.managerDesignation,
    });
  });

  const existing = await client.execute('SELECT id, client_id, project_name FROM projects');
  const existingByKey = new Map(
    existing.rows.map((r) => [
      `${Number(r.client_id)}::${String(r.project_name).trim().toLowerCase()}`,
      Number(r.id),
    ]),
  );

  const { actions, skipped, duplicates } = planActions(valid, existingByKey, keyOf, opts.update);
  const toCreate = actions.filter((a) => a.kind === 'create').length;
  const toUpdate = actions.filter((a) => a.kind === 'update').length;

  printReport({
    entity: 'Projects',
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
        sql: `INSERT INTO projects
                (client_id, project_name, manager_name, manager_email, manager_mobile, manager_designation)
              VALUES (?, ?, ?, ?, ?, ?)`,
        args: [
          d.clientId,
          d.projectName,
          d.managerName ?? null,
          d.managerEmail ?? null,
          d.managerMobile ?? null,
          d.managerDesignation ?? null,
        ],
      });
    } else {
      await client.execute({
        sql: `UPDATE projects SET
                manager_name = ?, manager_email = ?, manager_mobile = ?, manager_designation = ?
              WHERE id = ?`,
        args: [
          d.managerName ?? null,
          d.managerEmail ?? null,
          d.managerMobile ?? null,
          d.managerDesignation ?? null,
          a.id,
        ],
      });
    }
  }
}
