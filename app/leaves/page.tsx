import { PageHeader } from '@/components/ui';
import { holidaysBetween } from '@/lib/holidays';
import { db } from '@/lib/db';
import { myLeaves } from '@/lib/leaves';
import { requireCurrentAccount } from '@/lib/session';
import { linkedResourceId } from '@/lib/timesheets';
import { deployments, projects } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { shiftDate } from '@/lib/timesheet-rules';
import { today } from '@/lib/utils';
import LeavesClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Leaves · Resource Deployment' };

/**
 * A resource's own leave (FSD-21). Everything here is read for the resource
 * record the signed-in account is linked to, and carries no money.
 */
export default async function LeavesPage() {
  const session = await requireCurrentAccount();
  const resourceId = await linkedResourceId(session.uid);

  if (!resourceId) {
    return (
      <div className="pb-12">
        <PageHeader title="My Leaves" />
        <p className="max-w-xl px-6 py-8 text-sm leading-6 text-ink2">
          Your account is not linked to a resource record yet. Ask Admin to link it on the People screen.
        </p>
      </div>
    );
  }

  const clientRows = await db
    .select({ clientId: projects.clientId })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(eq(deployments.resourceId, resourceId))
    .all();
  const clientIds = [...new Set(clientRows.map((r) => r.clientId))];
  // The holiday dates the apply form uses to say how many days a request takes.
  const from = shiftDate(today(), -400);
  const to = shiftDate(today(), 400);
  const holidays = (await holidaysBetween(db, from, to, clientIds)).map((h) => h.date);

  return <LeavesClient initial={await myLeaves(resourceId)} holidays={holidays} today={today()} />;
}
