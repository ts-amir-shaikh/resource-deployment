import Link from 'next/link';
import { Badge, EmptyState, PageHeader, Stat, TableShell } from '@/components/ui';
import { requireCurrentAccount } from '@/lib/session';
import { TALLY_PAGE_SIZE, tallyCompanyList, tallyCounts, tallyRecentRuns, tallyRecordPage } from '@/lib/tally';
import { TALLY_ENTITIES, TALLY_ENTITY_LABELS, type TallyEntity } from '@/lib/tally-rules';
import { cn, formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Params = { company?: string; entity?: string; q?: string; deleted?: string; page?: string };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

/**
 * M63: the Tally mirror, read only. The bridge on the Accounts PC pushes
 * changed records to /api/integration/v1/tally/records; this screen shows what
 * has arrived and when. Plain links and a GET form, so it needs no client code.
 */
export default async function TallyPage({ searchParams }: { searchParams: Params }) {
  await requireCurrentAccount();
  const companies = await tallyCompanyList();

  if (companies.length === 0) {
    return (
      <div className="pb-12">
        <PageHeader title="Tally Data" subtitle="Ledgers and vouchers mirrored from TallyPrime. Read only." />
        <div className="px-6 py-4">
          <div className="card">
            <EmptyState
              title="Nothing received from Tally yet"
              description="Once the Tally bridge on the Accounts PC is set to push here, ledgers and vouchers appear within a minute."
            />
          </div>
        </div>
      </div>
    );
  }

  const company = companies.find((c) => c.companyKey === searchParams.company) ?? companies[0];
  const entity: TallyEntity = (TALLY_ENTITIES as readonly string[]).includes(searchParams.entity ?? '')
    ? (searchParams.entity as TallyEntity)
    : 'ledger';
  const q = (searchParams.q ?? '').trim().slice(0, 100);
  const deleted = searchParams.deleted === '1';
  const page = Math.max(1, Math.trunc(Number(searchParams.page)) || 1);

  const [counts, list, runs] = await Promise.all([
    tallyCounts(company.companyKey),
    tallyRecordPage({ companyKey: company.companyKey, entity, q: q || undefined, deleted, page }),
    tallyRecentRuns(company.companyKey),
  ]);
  const pages = Math.max(1, Math.ceil(list.total / TALLY_PAGE_SIZE));

  const href = (over: Partial<Params>) => {
    const p = new URLSearchParams();
    const merged: Params = { company: company.companyKey, entity, q: q || undefined, deleted: deleted ? '1' : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/tally?${p.toString()}`;
  };

  return (
    <div className="pb-12">
      <PageHeader title="Tally Data" subtitle={`${company.name} · last received ${when(company.lastPushAt)} · read only, Tally is the source`} />

      <div className="space-y-4 px-6 py-4">
        {companies.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {companies.map((c) => (
              <Link key={c.companyKey} href={`/tally?company=${encodeURIComponent(c.companyKey)}`} className={cn('btn', c.companyKey === company.companyKey ? 'btn-primary' : 'btn-ghost')}>
                {c.name}
              </Link>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {TALLY_ENTITIES.map((e) => (
            <Stat key={e} label={TALLY_ENTITY_LABELS[e]} value={counts[e] ?? 0} />
          ))}
        </div>

        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
            <nav className="flex flex-wrap gap-1">
              {TALLY_ENTITIES.map((e) => (
                <Link key={e} href={href({ entity: e, q: undefined, page: undefined })} className={cn('btn', e === entity ? 'btn-primary' : 'btn-ghost')}>
                  {TALLY_ENTITY_LABELS[e]}
                </Link>
              ))}
            </nav>
            <form method="get" action="/tally" className="flex items-center gap-2">
              <input type="hidden" name="company" value={company.companyKey} />
              <input type="hidden" name="entity" value={entity} />
              <input name="q" defaultValue={q} placeholder="Search name, group or GUID" className="input w-64" />
              <label className="flex items-center gap-1 text-sm text-ink2">
                <input type="checkbox" name="deleted" value="1" defaultChecked={deleted} /> Include deleted
              </label>
              <button className="btn-ghost btn" type="submit">
                Search
              </button>
            </form>
          </div>

          {list.rows.length === 0 ? (
            <EmptyState title="No records" description={q ? `Nothing matches "${q}".` : 'Nothing of this kind has arrived yet.'} />
          ) : (
            <TableShell>
              <thead className="border-b border-line bg-surface2">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">{entity === 'voucher' ? 'Voucher type' : 'Under'}</th>
                  {entity === 'voucher' && <th className="th">Date</th>}
                  <th className="th">AlterID</th>
                  <th className="th">Received</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="td font-medium text-ink">{r.name}</td>
                    <td className="td">{r.parent ?? '—'}</td>
                    {entity === 'voucher' && <td className="td tnum">{formatDate(r.date)}</td>}
                    <td className="td tnum">{r.alterId}</td>
                    <td className="td tnum">{when(r.receivedAt)}</td>
                    <td className="td">{r.isDeleted ? <Badge tone="rose">Deleted in Tally</Badge> : <Badge tone="green">Live</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}

          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink2">
            <span>
              {list.total === 0 ? 'No records' : `Showing ${(page - 1) * TALLY_PAGE_SIZE + 1}–${Math.min(page * TALLY_PAGE_SIZE, list.total)} of ${list.total}`}
            </span>
            {pages > 1 && (
              <span className="flex gap-2">
                {page > 1 && (
                  <Link className="btn-ghost btn" href={href({ page: String(page - 1) })}>
                    Previous
                  </Link>
                )}
                {page < pages && (
                  <Link className="btn-ghost btn" href={href({ page: String(page + 1) })}>
                    Next
                  </Link>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Recent pushes from the bridge</div>
          <TableShell>
            <thead className="border-b border-line bg-surface2">
              <tr>
                <th className="th">Received</th>
                <th className="th">Records</th>
                <th className="th">New</th>
                <th className="th">Updated</th>
                <th className="th">Unchanged</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  {/* created_at is SQLite CURRENT_TIMESTAMP: UTC without a zone marker. */}
                  <td className="td tnum">{when(`${r.createdAt.replace(' ', 'T')}Z`)}</td>
                  <td className="td tnum">{r.received}</td>
                  <td className="td tnum">{r.inserted}</td>
                  <td className="td tnum">{r.updated}</td>
                  <td className="td tnum">{r.unchanged}</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      </div>
    </div>
  );
}
