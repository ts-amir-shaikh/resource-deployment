/**
 * Which paths belong to the reporting API, and which dataset scope each one
 * needs. Edge-safe: no database, no node:* imports. Shared by the middleware
 * gate, the access policy and the route handler, so all three agree on what
 * "a reporting path" is.
 */

export const REPORTING_SCOPES = ['billing', 'invoices', 'capacity', 'pipeline', 'renewals'] as const;
export type ReportingScope = (typeof REPORTING_SCOPES)[number];

export const REPORTING_BASE = '/api/reporting/v1';

export const SCOPE_PATHS: Record<ReportingScope, string> = {
  billing: `${REPORTING_BASE}/billing`,
  invoices: `${REPORTING_BASE}/invoices`,
  capacity: `${REPORTING_BASE}/capacity`,
  pipeline: `${REPORTING_BASE}/pipeline`,
  renewals: `${REPORTING_BASE}/renewals`,
};

/**
 * One canonical spelling of a path: percent-decoded, lower-cased, duplicate
 * slashes collapsed, trailing slash removed. Returns null when it cannot be
 * decoded. The routing layer and this function must never disagree about
 * whether a path is a reporting path, so every comparison below goes through
 * here and errs towards "yes, it is".
 */
function canonical(pathname: string): string | null {
  let p = pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  p = p.toLowerCase().replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * True for anything under /api that mentions "reporting" once canonicalised,
 * and for any /api path that cannot be decoded. Deliberately broader than the
 * five real paths: an odd spelling must land in the reporting gate and be
 * refused, never fall through to the session policy.
 */
export function isReportingPath(pathname: string): boolean {
  const c = canonical(pathname);
  if (c === null) return pathname.toLowerCase().startsWith('/api');
  return c.startsWith('/api') && c.includes('reporting');
}

/** The scope an exact reporting path needs, or null for any other path. */
export function scopeForPath(pathname: string): ReportingScope | null {
  const c = canonical(pathname);
  if (c === null) return null;
  for (const scope of REPORTING_SCOPES) {
    if (SCOPE_PATHS[scope] === c) return scope;
  }
  return null;
}
