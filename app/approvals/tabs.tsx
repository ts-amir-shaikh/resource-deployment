'use client';

import { useState } from 'react';
import type { QueueGroup } from '@/lib/timesheets';
import type { LeaveQueue } from '@/lib/leaves';
import ApprovalsClient from './client';
import LeaveApprovals from './leaves';

/** One screen for everything a Resource Manager approves: timesheets, and leave. */
export default function ApprovalsTabs({
  timesheets,
  leaves,
  canReview,
  initialTab,
}: {
  timesheets: QueueGroup[];
  leaves: LeaveQueue;
  canReview: boolean;
  initialTab: 'timesheets' | 'leaves';
}) {
  const [tab, setTab] = useState(initialTab);
  const waiting = timesheets.reduce((s, g) => s + g.days.length, 0);
  const tabs = [
    { id: 'timesheets' as const, label: 'Timesheets', n: waiting },
    { id: 'leaves' as const, label: 'Leave', n: leaves.pending.length },
  ];
  return (
    <div>
      <div className="flex gap-1 border-b border-line px-6 pt-3" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${tab === t.id ? 'border-brand text-brand' : 'border-transparent text-ink2 hover:text-ink'}`}
          >
            {t.label}
            {t.n > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-2xs font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">{t.n}</span>}
          </button>
        ))}
      </div>
      {tab === 'timesheets' ? <ApprovalsClient initial={timesheets} canReview={canReview} /> : <LeaveApprovals queue={leaves} canReview={canReview} />}
    </div>
  );
}
