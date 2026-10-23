import { requireCurrentAccount } from '@/lib/session';
import { canWrite } from '@/lib/access';
import { approvalQueue } from '@/lib/timesheets';
import { leaveQueue } from '@/lib/leaves';
import ApprovalsTabs from './tabs';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Approvals · Resource Deployment' };

/**
 * The Resource Manager's queues (M65, G-RM-01; leave FSD-21). Admin sees them
 * too; Management reads. Opens on the leave tab when `?tab=leaves`.
 */
export default async function ApprovalsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const session = await requireCurrentAccount();
  const [timesheets, leaves] = await Promise.all([approvalQueue(), leaveQueue()]);
  return (
    <ApprovalsTabs
      timesheets={timesheets}
      leaves={leaves}
      canReview={canWrite(session.role, '/api/timesheets/approvals')}
      initialTab={searchParams.tab === 'leaves' ? 'leaves' : 'timesheets'}
    />
  );
}
