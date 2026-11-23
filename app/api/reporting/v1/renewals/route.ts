import { reportingHandle } from '@/lib/reporting/handler';
import { renewalsEndpoint } from '@/lib/reporting/renewals';

export const dynamic = 'force-dynamic';

/**
 * Read-only reporting endpoint (bearer token, scope "renewals"). GET only: there is
 * no other method handler, and the middleware gate refuses other methods first.
 * Everything else lives in lib/reporting/renewals.ts.
 */
export async function GET(req: Request) {
  return reportingHandle(req, renewalsEndpoint);
}
