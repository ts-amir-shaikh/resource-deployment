import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/session';
import { getOwnerBoard, getOwnerTeamBoard, getTeamOptions } from '@/lib/queries';
import OwnerBoard from '@/components/owner-board';
import { SalesLeadsPanel } from '@/components/leadgen-ui';
import { listLeads } from '@/lib/leadgen';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'My Deals · Resource Deployment' };

/**
 * The sales board. A member sees their own; a head sees the team and may
 * open any one member's board through the selector (the same one /my uses).
 * Admin may look too — it is their team as well.
 */
export default async function SalesPage({ searchParams }: { searchParams: { member?: string } }) {
  const viewer = await getViewer();
  if (viewer.role !== 'sales' && viewer.role !== 'admin') redirect('/');

  const isHead = viewer.role === 'admin' || viewer.isTeamLead;
  const members = isHead
    ? (await getTeamOptions('sales')).map((m) => ({ ...m, isTeamLead: false }))
    : [];
  const requested = Number(searchParams.member);
  const viewing =
    isHead && Number.isInteger(requested) ? (members.find((m) => m.id === requested) ?? null) : null;

  // A member's own board; a head's whole-team view when nobody is selected.
  const board = await getOwnerBoard('sales', viewing ? viewing.id : isHead ? null : viewer.uid || -1);
  const team = isHead && !viewing ? await getOwnerTeamBoard('sales') : null;
  // M66 (AE4): leads handed to Sales — the unassigned queue, and the viewer's own.
  const handed = (await listLeads(viewer)).filter((l) => l.status === 'handed_off' || l.status === 'requirement_raised');

  return (
    <OwnerBoard
      kind="sales"
      board={board}
      team={team}
      viewing={viewing}
      viewerName={viewer.name}
      members={team ? team.team : members}
      isHead={isHead}
      panel={
        <SalesLeadsPanel
          queue={handed.filter((l) => l.salesOwnerUserId === null)}
          mine={handed.filter((l) => l.salesOwnerUserId !== null && (isHead || l.salesOwnerUserId === viewer.uid))}
          isHead={isHead}
        />
      }
    />
  );
}
