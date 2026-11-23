import { reportingHandle } from '@/lib/reporting/handler';
import { billingEndpoint } from '@/lib/reporting/billing';

export const dynamic = 'force-dynamic';

/**
 * Read-only reporting endpoint (bearer token, scope "billing"). GET only: there is
 * no other method handler, and the middleware gate refuses other methods first.
 * Everything else lives in lib/reporting/billing.ts.
 */
export async function GET(req: Request) {
  return reportingHandle(req, billingEndpoint);
}
