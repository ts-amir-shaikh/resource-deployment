'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ClipboardList, Search } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { AccountReviewListRow } from '@/lib/reviews';
import { ACCOUNT_RATINGS, ACCOUNT_RATING_LABELS, periodLabel } from '@/lib/review-rules';
import { EmptyState, PageHeader, TableShell } from '@/components/ui';
import { RatingBadge, ReviewStatusBadge } from '@/components/review-ui';

export default function AccountReviewsClient({ rows, isSales }: { rows: AccountReviewListRow[]; isSales: boolean }) {
  const [search, setSearch] = useState('');
  const [rating, setRating] = useState('');
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => (!rating || r.rating === rating) && (!q || r.clientName.toLowerCase().includes(q)));
  }, [rows, search, rating]);

  return (
    <div className="pb-12">
      <PageHeader
        title="Account Reviews"
        subtitle={isSales ? 'Approved monthly reviews of the clients you own requirements at' : 'Every monthly account review, newest first'}
        action={
          !isSales && (
            <Link href="/reviews" className="btn-ghost">
              <ArrowLeft className="h-4 w-4" /> This month
            </Link>
          )
        }
      />
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink3" />
          <input className="input w-56 pl-8" placeholder="Search client" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-48" value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Rating">
          <option value="">Any rating</option>
          {ACCOUNT_RATINGS.map((r) => (
            <option key={r} value={r}>
              {ACCOUNT_RATING_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div className="px-6 py-4">
        <div className="card overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No account reviews yet"
              description={isSales ? 'Approved reviews of your clients appear here.' : 'Start one from Reviews for the month.'}
            />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Client</th>
                  <th className="th">Month</th>
                  <th className="th">Rating</th>
                  <th className="th">Status</th>
                  <th className="th">Approved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.id} className="hover:bg-surface2/50">
                    <td className="td">
                      <Link href={`/reviews/accounts/${r.id}`} className="font-medium text-ink hover:underline">
                        {r.clientName}
                      </Link>
                    </td>
                    <td className="td">{periodLabel(r.period)}</td>
                    <td className="td">
                      <RatingBadge value={r.rating} short />
                    </td>
                    <td className="td">
                      <ReviewStatusBadge value={r.status} />
                    </td>
                    <td className="td">{formatDate(r.approvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </div>
      </div>
    </div>
  );
}
