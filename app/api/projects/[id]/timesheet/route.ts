import { eq } from 'drizzle-orm';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { db } from '@/lib/db';
import { projects } from '@/lib/schema';
import { projectTimesheetSchema } from '@/lib/validations';

export const dynamic = 'force-dynamic';

/** The default timesheet version for the project's deployments (D10). */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid id', 400);
    const { data, error } = await parseBody(req, projectTimesheetSchema);
    if (error) return error;
    const row = await db
      .update(projects)
      .set(data)
      .where(eq(projects.id, id))
      .returning({ id: projects.id })
      .get();
    if (!row) return fail('Project not found', 404);
    return ok({ saved: true });
  });
}
