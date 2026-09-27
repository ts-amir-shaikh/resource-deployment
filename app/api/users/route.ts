import { handle, ok, fail, parseBody } from '@/lib/api';
import { getViewer } from '@/lib/session';
import { accountSchema } from '@/lib/validations';
import { createPerson, listPeople } from '@/lib/accounts/people';

export const dynamic = 'force-dynamic';

/**
 * Every login (R6). Admin and Management read it (R22); only Admin adds one
 * (R1). Middleware already keeps other roles out and Management's writes
 * refused; the role checks here say so again where the rule lives.
 */
export async function GET() {
  return handle(async () => {
    const viewer = await getViewer();
    if (viewer.role !== 'admin' && viewer.role !== 'management') return fail('Not allowed', 403);
    return ok(await listPeople());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const viewer = await getViewer();
    if (viewer.role !== 'admin') return fail('Only Admin can add accounts.', 403);
    const { data, error } = await parseBody(req, accountSchema);
    if (error) return error;
    const result = await createPerson(data, viewer.uid);
    if (!result.ok) return fail(result.message, result.status, { fields: result.fields });
    return ok({ id: result.id }, 201);
  });
}
