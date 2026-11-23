import { logEvent } from './log';

/**
 * The reporting audit trail, and the ONLY file under lib/reporting that may
 * write to the database or import the application's global client.
 *
 * One append-only INSERT into `reporting_audit_log` per authenticated request
 * that reached the handler (200, 422, 429, 500, 503). Denials made by the Edge
 * gate (missing/invalid/expired token, wrong scope, wrong method) never get
 * here — the gate has no database — and are observable only as platform log
 * lines. This table therefore does not show failed sign-in attempts.
 *
 * Failure policy: FAIL CLOSED by default. If the row cannot be written the
 * request is refused (503 audit_unavailable) so nothing is read without a
 * record. It may fail open only when BOTH REPORTING_AUDIT_FAILURE_MODE=open
 * and REPORTING_ALERTING_VERIFIED=true are set, i.e. someone has confirmed
 * that an alert fires on `reporting_audit_write_failed` (runbook). In every
 * mode a failure is logged, together with a fallback record of what the row
 * would have held.
 *
 * Nothing sensitive is recorded: ids, endpoint, status, counts, timing and the
 * already-validated query parameters. No token, no body, no IP.
 */

export type AuditRecord = {
  requestId: string;
  tokenId: string;
  endpoint: string;
  status: number;
  resultCode: string;
  rowCount: number;
  durationMs: number;
  cacheHit: boolean;
  /** The validated parameters only (never the raw query string). */
  params: Record<string, string | number | boolean>;
};

export type Env = Record<string, string | undefined>;

export type AuditMode = 'table' | 'log';
export type FailurePolicy = 'open' | 'closed';

export const AUDIT_TIMEOUT_MS = 1500;

export function auditMode(env: Env): AuditMode {
  return env.REPORTING_AUDIT === 'log' ? 'log' : 'table';
}

export function failurePolicy(env: Env): FailurePolicy {
  return env.REPORTING_AUDIT_FAILURE_MODE === 'open' && env.REPORTING_ALERTING_VERIFIED === 'true'
    ? 'open'
    : 'closed';
}

/** What gets written; exported for tests so the allowed columns are pinned. */
export function auditRow(rec: AuditRecord) {
  return {
    requestId: rec.requestId,
    tokenId: rec.tokenId,
    endpoint: rec.endpoint,
    status: rec.status,
    resultCode: rec.resultCode,
    rowCount: rec.rowCount,
    durationMs: rec.durationMs,
    cacheHit: rec.cacheHit ? 1 : 0,
    paramsJson: JSON.stringify(rec.params),
  };
}

export type AuditInsert = (rec: AuditRecord) => Promise<void>;

/** The real INSERT. The global client is imported lazily so importing this module never opens a database. */
export const insertAuditRow: AuditInsert = async (rec) => {
  const { db } = await import('@/lib/db');
  const { reportingAuditLog } = await import('@/lib/schema');
  await db.insert(reportingAuditLog).values(auditRow(rec)).run();
};

export type AuditOutcome = { ok: true } | { ok: false; errorClass: string };

/**
 * Writes the audit record. Never throws. On failure it logs and returns
 * `{ ok: false }`; the caller applies `failurePolicy`.
 */
export async function writeAudit(
  rec: AuditRecord,
  env: Env = process.env,
  insert: AuditInsert = insertAuditRow,
  timeoutMs = AUDIT_TIMEOUT_MS,
): Promise<AuditOutcome> {
  if (auditMode(env) === 'log') {
    logEvent('info', 'reporting_audit', fieldsOf(rec));
    return { ok: true };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      insert(rec),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('audit_timeout')), timeoutMs);
      }),
    ]);
    return { ok: true };
  } catch (err) {
    const errorClass = err instanceof Error ? (err.message === 'audit_timeout' ? 'timeout' : err.name) : 'unknown';
    logEvent('error', 'reporting_audit_write_failed', {
      requestId: rec.requestId,
      tokenId: rec.tokenId,
      endpoint: rec.endpoint,
      status: rec.status,
      errorClass,
    });
    logEvent('info', 'reporting_audit_fallback', fieldsOf(rec));
    return { ok: false, errorClass };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fieldsOf(rec: AuditRecord) {
  return {
    requestId: rec.requestId,
    tokenId: rec.tokenId,
    endpoint: rec.endpoint,
    status: rec.status,
    resultCode: rec.resultCode,
    rowCount: rec.rowCount,
    durationMs: rec.durationMs,
    cacheHit: rec.cacheHit,
    params: JSON.stringify(rec.params),
  };
}
