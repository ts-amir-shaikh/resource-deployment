import { eq } from 'drizzle-orm';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { db } from '@/lib/db';
import { deployments } from '@/lib/schema';
import { deploymentTimesheetSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/**
 * Admin's timesheet settings for one deployment (D9, D10, D3). A route of its
 * own rather than fields on the deployment form, so the existing deployment
 * save — which validates billing, allocation and the PO — is untouched.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid id', 400);
    const { data, error } = await parseBody(req, deploymentTimesheetSchema);
    if (error) return error;
    const row = await db
      .update(deployments)
      .set(data)
      .where(eq(deployments.id, id))
      .returning({ id: deployments.id })
      .get();
    if (!row) return fail('Deployment not found', 404);
    return ok({ saved: true });
  });
}
