'use client';

import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';

/**
 * M38 — which board a team lead is looking at.
 *
 * The choice lives in the URL rather than component state so a lead can send
 * a colleague "look at Akshay's board" as a link, and so the server renders
 * the right person's data on first paint rather than swapping after load.
 */
export default function MemberSelect({
  members,
  selected,
}: {
  members: { id: number; name: string; isTeamLead: boolean }[];
  selected: number | null;
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-ink2">
      <Users className="h-4 w-4 text-ink3" />
      <select
        className="input w-auto"
        value={selected ?? ''}
        onChange={(e) => router.push(e.target.value ? `/my?member=${e.target.value}` : '/my')}
        aria-label="Whose board to show"
      >
        <option value="">Whole team</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.isTeamLead ? ' (lead)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
