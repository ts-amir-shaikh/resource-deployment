import { reportingHandle } from '@/lib/reporting/handler';
import { invoicesEndpoint } from '@/lib/reporting/invoices';

export const dynamic = 'force-dynamic';

/**
 * Read-only reporting endpoint (bearer token, scope "invoices"). GET only: there is
 * no other method handler, and the middleware gate refuses other methods first.
 * Everything else lives in lib/reporting/invoices.ts.
 */
export async function GET(req: Request) {
  return reportingHandle(req, invoicesEndpoint);
}
