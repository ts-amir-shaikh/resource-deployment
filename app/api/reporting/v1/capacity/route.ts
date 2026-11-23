import { reportingHandle } from '@/lib/reporting/handler';
import { capacityEndpoint } from '@/lib/reporting/capacity';

export const dynamic = 'force-dynamic';

/**
 * Read-only reporting endpoint (bearer token, scope "capacity"). GET only: there is
 * no other method handler, and the middleware gate refuses other methods first.
 * Everything else lives in lib/reporting/capacity.ts.
 */
export async function GET(req: Request) {
  return reportingHandle(req, capacityEndpoint);
}
