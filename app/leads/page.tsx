import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { getOwnerBoard, getOwnerTeamBoard, getTeamOptions } from '@/lib/queries';
import OwnerBoard from '@/components/owner-board';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Leads · Resource Deployment' };

/**
 * The leadgen board. A member sees their own; a head sees the team and may
 * open any one member's board through the selector (the same one /my uses).
 * Admin may look too — it is their team as well.
 */
export default async function LeadsPage({ searchParams }: { searchParams: { member?: string } }) {
  const viewer = await getViewer();
  if (viewer.role !== 'leadgen' && viewer.role !== 'admin') redirect('/');

  const isHead = viewer.role === 'admin' || viewer.isTeamLead;
  const members = isHead
    ? (await getTeamOptions('leadgen')).map((m) => ({ ...m, isTeamLead: false }))
    : [];
  const requested = Number(searchParams.member);
  const viewing =
    isHead && Number.isInteger(requested) ? (members.find((m) => m.id === requested) ?? null) : null;

  // A member's own board; a head's whole-team view when nobody is selected.
  const board = await getOwnerBoard('lead', viewing ? viewing.id : isHead ? null : viewer.uid || -1);
  const team = isHead && !viewing ? await getOwnerTeamBoard('lead') : null;

  return (
    <OwnerBoard
      kind="lead"
      board={board}
      team={team}
      viewing={viewing}
      viewerName={viewer.name}
      members={team ? team.team : members}
      isHead={isHead}
    />
  );
}
