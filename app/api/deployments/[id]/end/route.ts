import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { deployments } from '@/lib/schema';
import { endDeploymentSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

/** Closes a deployment, freeing its allocation back to the resource. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid deployment id', 400);

    const existing = await db.select().from(deployments).where(eq(deployments.id, id)).get();
    if (!existing) return fail('Deployment not found', 404);
    if (existing.status === 'ended') {
      return fail('This deployment has already ended', 409);
    }

    const { data, error } = await parseBody(req, endDeploymentSchema);
    if (error) return error;

    if (data.endDate < existing.startDate) {
      return fail('End date cannot be before the start date', 422, {
        fields: { endDate: 'End date cannot be before the start date' },
      });
    }

    const row = await db
      .update(deployments)
      .set({ status: 'ended', endDate: data.endDate })
      .where(eq(deployments.id, id))
      .returning()
      .get();

    return ok(row);
  });
}
