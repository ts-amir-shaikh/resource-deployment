import { handle } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { exportResponse } from '@/lib/export/respond';
import { loadPipeline } from '@/lib/lists/load/pipeline';
import { pipelineList } from '@/lib/lists/pipeline';

export const dynamic = 'force-dynamic';

/**
 * CSV of the staffing pipeline. Back office only — see canExport in
 * lib/access.ts. Loaded through the same row scoping and budget stripping as
 * the board, so the rule still holds if export is ever opened to other roles.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    return exportResponse({ req, actor: viewer, def: pipelineList, rows: await loadPipeline(viewer) });
  });
}
