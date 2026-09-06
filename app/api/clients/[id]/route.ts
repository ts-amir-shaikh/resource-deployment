import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, projects, opportunities } from '@/lib/schema';
import { clientSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid client id', 400);

    const row = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!row) return fail('Client not found', 404);

    const linked = await db
      .select()
      .from(projects)
      .where(eq(projects.clientId, id))
      .orderBy(projects.projectName)
      .all();

    return ok({ ...row, projects: linked });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid client id', 400);

    const existing = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!existing) return fail('Client not found', 404);

    const { data, error } = await parseBody(req, clientSchema);
    if (error) return error;

    const row = await db.update(clients).set(data).where(eq(clients.id, id)).returning().get();
    return ok(row);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid client id', 400);

    const linked = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.clientId, id))
      .all();

    if (linked.length) {
      return fail(
        `This client has ${linked.length} project${linked.length > 1 ? 's' : ''}. Delete those first.`,
        409,
      );
    }

    // M8 impact: opportunities also reference clients.
    const opps = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.clientId, id))
      .all();

    if (opps.length) {
      return fail(
        `This client has ${opps.length} opportunit${opps.length > 1 ? 'ies' : 'y'} in the pipeline. Close or reassign them first.`,
        409,
      );
    }

    await db.delete(clients).where(eq(clients.id, id)).run();
    return ok({ deleted: id });
  });
}
