import { requireCurrentAccount } from '@/lib/session';
import { canWrite } from '@/lib/access';
import { approvalQueue } from '@/lib/timesheets';
import ApprovalsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Timesheet Approvals · Resource Deployment' };

/** The Resource Manager's queue (M65, G-RM-01). Admin sees it too; Management reads it. */
export default async function ApprovalsPage() {
  const session = await requireCurrentAccount();
  return (
    <ApprovalsClient
      initial={await approvalQueue()}
      canReview={canWrite(session.role, '/api/timesheets/approvals')}
    />
  );
}
