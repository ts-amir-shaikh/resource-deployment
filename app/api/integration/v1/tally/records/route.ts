import { db } from '@/lib/db';
import { ok } from '@/lib/api';
import { integration, readBody } from '@/lib/integration';
import { tallyPushSchema } from '@/lib/tally-rules';
import { storeTallyPush } from '@/lib/tally-store';

export const dynamic = 'force-dynamic';

/**
 * M63 push: changed Tally records from the bridge on the Accounts PC.
 *
 * Idempotent: records are stored by Tally GUID and a lower AlterID never
 * overwrites a higher one, so the bridge resends freely after a failure.
 * Nothing is ever deleted: a record removed in Tally arrives marked deleted.
 * The bridge only moves on once this answers 200, so an error here means the
 * same batch comes back on its next run.
 */
export async function POST(req: Request) {
  return integration(req, 'read-write', async (caller) => {
    const { data, error } = await readBody(req, tallyPushSchema);
    if (error) return error;
    return ok(await storeTallyPush(db, data, caller.keyId));
  });
}
