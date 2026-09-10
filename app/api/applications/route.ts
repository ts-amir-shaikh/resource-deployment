import { getApplicationQueue } from '@/lib/queries';
import { requireSession } from '@/lib/session';
import { handle, ok } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The applicant queue.
 *
 * Nothing commercial passes through here — an application carries the
 * candidate's own expectations, never the client's budget — so unlike the
 * opportunity routes there is no strip step on the way out.
 */
export async function GET() {
  return handle(async () => {
    await requireSession();
    return ok({ applications: await getApplicationQueue() });
  });
}
