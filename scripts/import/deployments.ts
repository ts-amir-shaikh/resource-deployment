import type { Client } from '@libsql/client';
import { deploymentSchema } from '../../lib/validations';
import {
  readCsv,
  checkHeaders,
  blankToUndefined,
  cleanNumber,
  validateRows,
  planActions,
  printReport,
  type Row,
  type InvalidRow,
} from './lib';

/**
 * Unique key: (resource, project, start date). Deployments have no natural
 * unique key the way an email or company name does — a resource can
 * legitimately have several concurrent deployments — so this importer
 * treats "same resource starting on the same project on the same date" as
 * the same record for re-run safety.
 */
const keyOf = (data: { resourceId: number; projectId: number; startDate: string }) =>
  `${data.resourceId}::${data.projectId}::${data.startDate}`;

/** "true"/"yes"/"1" (any case) is true; everything else, including the
 *  string "false", is false. z.coerce.boolean() alone would get this wrong —
 *  Boolean("false") is true, since any non-empty string is truthy in JS. */
function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback;
  return /^(true|yes|1)$/i.test(value.trim());
}

export async function importDeployments(
  client: Client,
  path: string,
  opts: { commit: boolean; update: boolean },
) {
  const rawRows = readCsv(path);
  checkHeaders(rawRows, ['resourceEmail', 'clientName', 'projectName', 'startDate']);

  const resourceRows = await client.execute('SELECT id, email FROM resources');
  const resourceIdByEmail = new Map(
    resourceRows.rows.map((r) => [String(r.email).trim().toLowerCase(), Number(r.id)]),
  );

  const projectRows = await client.execute(
    `SELECT p.id, p.project_name, c.company_name
     FROM projects p JOIN clients c ON c.id = p.client_id`,
  );
  const projectIdByKey = new Map(
    projectRows.rows.map((r) => [
      `${String(r.company_name).trim().toLowerCase()}::${String(r.project_name).trim().toLowerCase()}`,
      Number(r.id),
    ]),
  );

  // Only active agreements are offered here — matching the app's own
  // deployment form, which never lets a renewed or expired version be
  // picked for new work.
  const agreementRows = await client.execute(
    "SELECT id, agreement_number, project_id, status FROM agreements WHERE agreement_number IS NOT NULL",
  );
  const agreementByNumber = new Map(
    agreementRows.rows
      .filter((r) => String(r.status) === 'active')
      .map((r) => [
        String(r.agreement_number).trim().toLowerCase(),
        { id: Number(r.id), projectId: Number(r.project_id) },
      ]),
  );
  const inactiveAgreementNumbers = new Set(
    agreementRows.rows
      .filter((r) => String(r.status) !== 'active')
      .map((r) => String(r.agreement_number).trim().toLowerCase()),
  );

  const { valid, invalid } = validateRows(rawRows, deploymentSchema, (raw: Row) => {
    const resourceEmail = (raw.resourceEmail ?? '').trim();
    const resourceId = resourceIdByEmail.get(resourceEmail.toLowerCase());
    if (!resourceId) {
      return { __error: `resourceEmail: no resource with email "${resourceEmail}"` };
    }

    const clientName = (raw.clientName ?? '').trim();
    const projectName = (raw.projectName ?? '').trim();
    const projectKey = `${clientName.toLowerCase()}::${projectName.toLowerCase()}`;
    const projectId = projectIdByKey.get(projectKey);
    if (!projectId) {
      return {
        __error: `clientName/projectName: no project "${projectName}" under client "${clientName}"`,
      };
    }

    let agreementId: string | undefined;
    const agreementNumber = (raw.agreementNumber ?? '').trim();
    if (agreementNumber) {
      const agreement = agreementByNumber.get(agreementNumber.toLowerCase());
      if (!agreement) {
        if (inactiveAgreementNumbers.has(agreementNumber.toLowerCase())) {
          return {
            __error: `agreementNumber: "${agreementNumber}" is renewed or expired — link the current active version instead`,
          };
        }
        return { __error: `agreementNumber: no agreement numbered "${agreementNumber}"` };
      }
      if (agreement.projectId !== projectId) {
        return {
          __error: `agreementNumber: "${agreementNumber}" belongs to a different project than "${projectName}"`,
        };
      }
      agreementId = String(agreement.id);
    }

    return blankToUndefined({
      resourceId: String(resourceId),
      projectId: String(projectId),
      agreementId,
      // Blank means INR, matching the column default — an existing sheet
      // without the column keeps importing unchanged.
      currency: (raw.currency || 'INR').toUpperCase(),
      deploymentType: raw.deploymentType || 'billable',
      allocationPercentage: raw.allocationPercentage || '100',
      startDate: raw.startDate,
      endDate: raw.endDate,
      billingAmount: cleanNumber(raw.billingAmount),
      commissionAmount: cleanNumber(raw.commissionAmount),
      gstApplicable: toBool(raw.gstApplicable, true),
    });
  });

  // Existing deployments, keyed the same way, so a re-run recognises rows it
  // already created and so the allocation baseline below can exclude a row's
  // own current allocation when it's about to be updated in place.
  const existingRows = await client.execute(
    'SELECT id, resource_id, project_id, start_date, allocation_percentage, status FROM deployments',
  );
  const existingByKey = new Map(
    existingRows.rows.map((r) => [
      keyOf({
        resourceId: Number(r.resource_id),
        projectId: Number(r.project_id),
        startDate: String(r.start_date),
      }),
      {
        id: Number(r.id),
        resourceId: Number(r.resource_id),
        allocationPercentage: Number(r.allocation_percentage),
        status: String(r.status),
      },
    ]),
  );
  const existingIdByKey = new Map([...existingByKey].map(([k, v]) => [k, v.id]));

  const { actions, skipped, duplicates } = planActions(
    valid,
    existingIdByKey,
    keyOf,
    opts.update,
  );

  // Allocation cap: replicate the same 100%-per-resource rule the app
  // enforces on every write, in the order rows appear in the file. A row
  // that would push a resource over 100% is pulled out of `actions` here
  // rather than silently written — reusing lib/queries.ts isn't possible
  // from a plain script (it's marked server-only for Next.js), so the check
  // is re-implemented directly against the same table.
  const activeSums = await client.execute(
    "SELECT resource_id, sum(allocation_percentage) AS total FROM deployments WHERE status = 'active' GROUP BY resource_id",
  );
  const tally = new Map<number, number>(
    activeSums.rows.map((r) => [Number(r.resource_id), Number(r.total)]),
  );
  // A row that will update an existing active deployment replaces that
  // deployment's own allocation — exclude the old value so it isn't double
  // counted against the new one.
  for (const action of actions) {
    if (action.kind !== 'update') continue;
    const existing = existingByKey.get(keyOf(action.data));
    if (existing && existing.status === 'active') {
      tally.set(existing.resourceId, (tally.get(existing.resourceId) ?? 0) - existing.allocationPercentage);
    }
  }

  const overAllocated: InvalidRow[] = [];
  const withinCap: typeof actions = [];
  for (const action of actions) {
    const used = tally.get(action.data.resourceId) ?? 0;
    const requested = action.data.allocationPercentage;
    if (used + requested > 100) {
      overAllocated.push({
        row: action.row,
        errors: [
          `allocationPercentage: only ${Math.max(0, 100 - used)}% free for this resource at this point in the file, but ${requested}% was requested`,
        ],
      });
      continue;
    }
    tally.set(action.data.resourceId, used + requested);
    withinCap.push(action);
  }

  const toCreate = withinCap.filter((a) => a.kind === 'create').length;
  const toUpdate = withinCap.filter((a) => a.kind === 'update').length;

  printReport({
    entity: 'Deployments',
    totalRows: rawRows.length,
    // overAllocated is a distinct rejection reason from "duplicate within
    // file" — it belongs with schema/lookup failures, not the dedup bucket.
    invalid: [...invalid, ...overAllocated],
    duplicates,
    toCreate,
    toUpdate,
    toSkip: skipped.length,
    commit: opts.commit,
  });

  if (!opts.commit) return;

  for (const a of withinCap) {
    const d = a.data;
    if (a.kind === 'create') {
      await client.execute({
        sql: `INSERT INTO deployments
                (resource_id, project_id, agreement_id, currency, deployment_type, allocation_percentage,
                 start_date, end_date, billing_amount, commission_amount, gst_applicable, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
        args: [
          d.resourceId,
          d.projectId,
          d.agreementId ?? null,
          d.currency,
          d.deploymentType,
          d.allocationPercentage,
          d.startDate,
          d.endDate ?? null,
          d.billingAmount,
          d.commissionAmount,
          d.gstApplicable ? 1 : 0,
        ],
      });
    } else {
      await client.execute({
        sql: `UPDATE deployments SET
                agreement_id = ?, currency = ?, deployment_type = ?, allocation_percentage = ?,
                end_date = ?, billing_amount = ?, commission_amount = ?, gst_applicable = ?
              WHERE id = ?`,
        args: [
          d.agreementId ?? null,
          d.currency,
          d.deploymentType,
          d.allocationPercentage,
          d.endDate ?? null,
          d.billingAmount,
          d.commissionAmount,
          d.gstApplicable ? 1 : 0,
          a.id,
        ],
      });
    }
  }
}
