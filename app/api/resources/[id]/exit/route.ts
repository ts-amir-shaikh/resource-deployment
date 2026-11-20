import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources, deployments, projects, users } from '@/lib/schema';
import { resourceExitSchema } from '@/lib/validations';
import { handle, ok, fail, parseBody, parseId } from '@/lib/api';
import { requireSession } from '@/lib/session';
import {
  accessUntilForExit,
  deploymentsPastExit,
  deploymentsStartingAfterExit,
  exitRefusal,
} from '@/lib/resource-exit-rules';

export const dynamic = 'force-dynamic';

type Ctx = { params: { id: string } };

/**
 * M68 — record that a resource has left, or is leaving (D17, D19).
 *
 * Kept off the resource PUT on purpose. An exit is not another profile edit:
 * it ends deployments and shortens somebody's access, so it is its own verb
 * with its own refusal, and `resourceSchema` stays about the person.
 */
export async function POST(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);

    const session = await requireSession();
    const resource = await db.select().from(resources).where(eq(resources.id, id)).get();
    if (!resource) return fail('Resource not found', 404);
    if (resource.exitDate) {
      return fail(`${resource.name} is already recorded as leaving on ${resource.exitDate}.`, 409);
    }

    const { data, error } = await parseBody(req, resourceExitSchema);
    if (error) return error;

    const live = await db
      .select({
        id: deployments.id,
        projectName: projects.projectName,
        startDate: deployments.startDate,
        endDate: deployments.endDate,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .where(eq(deployments.resourceId, id))
      .all();

    // A deployment starting after the exit cannot simply be ended at the exit
    // date — that would leave it finishing before it began. Naming it is the
    // honest answer; somebody has to decide what it was meant to be.
    const future = deploymentsStartingAfterExit(live, data.exitDate);
    if (future.length > 0) {
      return fail(
        `${future.map((d) => d.projectName).join(', ')} ${
          future.length === 1 ? 'starts' : 'start'
        } after ${data.exitDate}. Remove or re-date ${future.length === 1 ? 'it' : 'them'} first.`,
        409,
        { deployments: future },
      );
    }

    const blocking = deploymentsPastExit(live, data.exitDate);
    const refusal = exitRefusal(live, data.exitDate, data.endOpenDeployments);
    if (refusal) return fail(refusal, 409, { deployments: blocking });

    const updated = await db.transaction(async (tx) => {
      const row = await tx
        .update(resources)
        .set({
          exitDate: data.exitDate,
          exitNotes: data.exitNotes ?? null,
          exitRecordedByUserId: session.uid || null,
        })
        .where(eq(resources.id, id))
        .returning()
        .get();

      // D17: only the ones that were actually running past the date, and only
      // because the operator ticked the box after being shown them.
      if (data.endOpenDeployments && blocking.length > 0) {
        await tx
          .update(deployments)
          .set({ endDate: data.exitDate })
          .where(
            and(
              eq(deployments.resourceId, id),
              or(isNull(deployments.endDate), gt(deployments.endDate, data.exitDate)),
            ),
          )
          .run();
      }

      // D19: the login lasts to the last working day, so the final timesheet
      // can still be filed. The account is not deleted and not deactivated.
      await tx
        .update(users)
        .set({ accessUntil: accessUntilForExit(data.exitDate) })
        .where(eq(users.resourceId, id))
        .run();

      return row;
    });

    return ok({ ...updated, deploymentsEnded: data.endOpenDeployments ? blocking.length : 0 });
  });
}

/**
 * D20 — undo. A mistyped date is near-certain at some point, and the
 * alternative is a resource who cannot be put back on the roster.
 *
 * Deployments ended by the exit are NOT reopened: by the time anyone notices,
 * the end dates may have been adjusted by hand, and guessing which ones to
 * revive would be worse than leaving them to be re-dated deliberately. The
 * linked account's access limit is lifted, since that was the exit's doing.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = parseId(params.id);
    if (!id) return fail('Invalid resource id', 400);

    const resource = await db.select().from(resources).where(eq(resources.id, id)).get();
    if (!resource) return fail('Resource not found', 404);
    if (!resource.exitDate) return fail('This resource has no exit recorded.', 409);

    const updated = await db.transaction(async (tx) => {
      const row = await tx
        .update(resources)
        .set({ exitDate: null, exitNotes: null, exitRecordedByUserId: null })
        .where(eq(resources.id, id))
        .returning()
        .get();

      await tx
        .update(users)
        .set({ accessUntil: null })
        .where(and(eq(users.resourceId, id), eq(users.accessUntil, resource.exitDate!)))
        .run();

      return row;
    });

    return ok(updated);
  });
}
