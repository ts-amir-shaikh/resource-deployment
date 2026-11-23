import { reportingHandle } from '@/lib/reporting/handler';
import { pipelineEndpoint } from '@/lib/reporting/pipeline';

export const dynamic = 'force-dynamic';

/**
 * Read-only reporting endpoint (bearer token, scope "pipeline"). GET only: there is
 * no other method handler, and the middleware gate refuses other methods first.
 * Everything else lives in lib/reporting/pipeline.ts.
 */
export async function GET(req: Request) {
  return reportingHandle(req, pipelineEndpoint);
}
