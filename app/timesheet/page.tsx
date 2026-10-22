import { requireCurrentAccount } from '@/lib/session';
import { PageHeader } from '@/components/ui';
import { linkedResourceId, loadMyTimesheet } from '@/lib/timesheets';
import { weekDates } from '@/lib/timesheet-rules';
import { today } from '@/lib/utils';
import TimesheetClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Timesheet · Resource Deployment' };

/**
 * A resource's own timesheet (M65, G-RES-01/02). Everything on it comes from
 * loadMyTimesheet(), which reads only the deployments of the resource record
 * this account is linked to, and returns no money field.
 */
export default async function TimesheetPage() {
  const session = await requireCurrentAccount();
  const resourceId = await linkedResourceId(session.uid);

  if (!resourceId) {
    return (
      <div className="pb-12">
        <PageHeader title="My Timesheet" />
        <p className="max-w-xl px-6 py-8 text-sm leading-6 text-ink2">
          Your account is not linked to a resource record yet, so there is no deployment to record
          time against. Ask Admin to link it on the People screen.
        </p>
      </div>
    );
  }

  const week = weekDates(today());
  const initial = await loadMyTimesheet(resourceId, week[0], week[6]);
  return <TimesheetClient initial={initial} initialWeek={week[0]} />;
}
