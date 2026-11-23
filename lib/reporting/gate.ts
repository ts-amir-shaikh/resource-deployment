import { NextResponse, type NextRequest } from 'next/server';
import { PATH_HEADER, SIGNED_IN_HEADER } from '@/lib/auth';
import { istToday } from './dates';
import { logEvent } from './log';
import { isReportingPath, scopeForPath } from './paths';
import { verifyBearer } from './verify';

export { isReportingPath };

/**
 * The Edge gate for /api/reporting. middleware.ts hands every reporting path
 * to this function first and returns whatever it returns: the request never
 * reaches the session code, so a browser session (any role, including admin
 * and management) neither helps nor hurts here.
 *
 * It has no database. It checks the method, then the bearer token against the
 * hashes in REPORTING_TOKENS, then the dataset scope for the exact path, and
 * forwards the request with the Cookie header removed. Denials are recorded
 * only as log lines (event `reporting_gate_denied`); they do not reach the
 * audit table. The handler verifies the token again (lib/reporting/handler.ts).
 *
 * Everything fails closed: a missing or malformed REPORTING_TOKENS refuses all
 * requests.
 */

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function deny(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extra: Record<string, string> = {},
): NextResponse {
  return new NextResponse(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...JSON_HEADERS, 'x-request-id': requestId, ...extra },
  });
}

export async function reportingGate(req: NextRequest, env: Record<string, string | undefined> = process.env): Promise<NextResponse> {
  const requestId = crypto.randomUUID();
  const { pathname } = req.nextUrl;

  if (req.method !== 'GET') {
    logEvent('warn', 'reporting_gate_denied', { requestId, code: 'method_not_allowed', method: req.method, path: pathname });
    return deny(405, 'method_not_allowed', 'Only GET is supported.', requestId, { allow: 'GET' });
  }

  const auth = await verifyBearer(req.headers.get('authorization'), env.REPORTING_TOKENS, istToday());
  if (!auth.ok) {
    logEvent(auth.reason === 'config_missing' || auth.reason === 'config_invalid' ? 'error' : 'warn', 'reporting_gate_denied', {
      requestId,
      code: 'unauthorized',
      reason: auth.reason,
      method: req.method,
      path: pathname,
      // The configuration problem (never a token) is worth reading in the log.
      detail: auth.reason === 'config_missing' || auth.reason === 'config_invalid' ? auth.detail : undefined,
    });
    return deny(401, 'unauthorized', 'Missing or invalid credentials.', requestId, {
      'www-authenticate': 'Bearer realm="reporting"',
    });
  }

  const scope = scopeForPath(pathname);
  if (scope === null) {
    logEvent('warn', 'reporting_gate_denied', { requestId, code: 'not_found', tokenId: auth.tokenId, method: req.method, path: pathname });
    return deny(404, 'not_found', 'No such reporting endpoint.', requestId);
  }
  if (!auth.scopes.includes(scope)) {
    logEvent('warn', 'reporting_gate_denied', { requestId, code: 'insufficient_scope', tokenId: auth.tokenId, method: req.method, path: pathname });
    return deny(403, 'insufficient_scope', 'This token does not grant access to this dataset.', requestId);
  }

  // Forward without any session material, and without the markers the
  // session gate sets (so nothing downstream mistakes this for a signed-in
  // person).
  const forwarded = new Headers(req.headers);
  forwarded.delete('cookie');
  forwarded.delete(SIGNED_IN_HEADER);
  forwarded.delete(PATH_HEADER);
  return NextResponse.next({ request: { headers: forwarded } });
}
