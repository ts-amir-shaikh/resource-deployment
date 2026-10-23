import { handle, ok } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { companyDuplicates } from '@/lib/leadgen';
import { idParam } from '@/lib/leadgen-api';

export const dynamic = 'force-dynamic';

/**
 * G-LED-06: prospects and clients whose name matches once normalised, for
 * the warning as someone types. `prospect` excludes the one being edited.
 */
export async function GET(req: Request) {
  return handle(async () => {
    await getViewer();
    const sp = new URL(req.url).searchParams;
    const name = sp.get('name')?.trim() ?? '';
    if (!name) return ok([]);
    const prospectId = idParam(sp.get('prospect'));
    return ok(await companyDuplicates(name, prospectId ? { kind: 'prospect', id: prospectId } : undefined));
  });
}
