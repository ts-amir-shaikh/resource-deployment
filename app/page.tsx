import Link from 'next/link';
import { AlertTriangle, ArrowUpRight, CalendarClock, Target } from 'lucide-react';
import {
  getDashboardSummary,
  getInvoiceSummary,
  getResourceUtilisation,
  getBillingByClient,
  getEndingSoon,
  getExpiringAgreements,
  getPipelineSummary,
  getPipelineValue,
  getDueFollowUps,
  syncExpiredAgreements,
} from '@/lib/queries';
import {
  formatMoneyMulti,
  sumByCurrency,
  coverageNote,
  formatDate,
  daysUntil,
  INVOICE_STATUS_LABELS,
  STAGE_LABELS,
  ACTIVE_STAGES,
} from '@/lib/utils';
import { Badge, Stat, AllocationBar, PageHeader, TableShell, KpiCard } from '@/components/ui';

export const dynamic = 'force-dynamic';

const STATUS_TONE = {
  not_raised: 'neutral',
  raised: 'amber',
  pending_collection: 'rose',
  collected: 'green',
} as const;

export default async function DashboardPage() {
  // The sync write must finish before anything reads agreement status; the
  // eight reads below don't depend on each other, so they run concurrently
  // rather than as eight sequential round trips to the database.
  await syncExpiredAgreements();

  const [s, inv, utilisation, billingByClient, endingSoon, expiring, pipeline, dueFollowUps] =
    await Promise.all([
      getDashboardSummary(),
      getInvoiceSummary(),
      getResourceUtilisation(),
      getBillingByClient(),
      getEndingSoon(30),
      getExpiringAgreements(30),
      getPipelineSummary(),
      getDueFollowUps(),
    ]);

  const pipelineValue = await getPipelineValue();

  // getBillingByClient already folds to one entry per client with its billing
  // per currency. Bars are sized WITHIN a currency — a bar comparing ₹80,000
  // against AED 8,000 would be pure nonsense.
  const maxByCurrency = new Map<string, number>();
  for (const c of billingByClient) {
    maxByCurrency.set(
      c.largest.currency,
      Math.max(maxByCurrency.get(c.largest.currency) ?? 0, c.largest.amount),
    );
  }

  const billingClients = billingByClient.map((c) => ({
    ...c,
    barPercent: (c.largest.amount / (maxByCurrency.get(c.largest.currency) || 1)) * 100,
  }));

  const deployedPct = s.totalResources
    ? Math.round(((s.fullyDeployed + s.partiallyDeployed) / s.totalResources) * 100)
    : 0;

  // Utilisation panel scales to any headcount: a distribution bar for the whole
  // bench, then only the resources that actually have capacity to sell.
  const benchTotal = Math.max(s.totalResources, 1);
  const needsAttention = utilisation.filter((r) => r.total < 100);

  return (
    <div className="pb-12">
      <PageHeader
        title="Dashboard"
        subtitle="Deployment, billing and collection health at a glance"
      />

      <div className="space-y-6 px-6 py-6">
        {/* Attention strip — only shown when something needs action */}
        {(inv.overdueCount > 0 || expiring.length > 0 || dueFollowUps.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {dueFollowUps.length > 0 && (
              <Link
                href="/pipeline"
                className="group flex flex-1 items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900 dark:bg-violet-950/40"
              >
                <Target className="h-4 w-4 shrink-0 text-violet-600 dark:text-violet-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-violet-900 dark:text-violet-200">
                    {dueFollowUps.length} pipeline follow-up
                    {dueFollowUps.length > 1 ? 's' : ''} due
                  </div>
                  <div className="truncate text-xs text-violet-700 dark:text-violet-400">
                    {dueFollowUps[0].title} — {dueFollowUps[0].nextStep}
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-violet-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            )}
            {inv.overdueCount > 0 && (
              <Link
                href="/invoices?overdue=true"
                className="group flex flex-1 items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 dark:border-rose-900 dark:bg-rose-950/40"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-rose-900 dark:text-rose-200">
                    {inv.overdueCount} overdue invoice
                    {inv.overdueCount > 1 ? 's' : ''} · {formatMoneyMulti(inv.overdueAmount)}
                  </div>
                  <div className="text-xs text-rose-700 dark:text-rose-400">
                    Past due date and not yet collected
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-rose-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            )}
            {expiring.length > 0 && (
              <Link
                href="/agreements"
                className="group flex flex-1 items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40"
              >
                <CalendarClock className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-amber-900 dark:text-amber-200">
                    {expiring.length} agreement{expiring.length > 1 ? 's' : ''} expiring
                    within 30 days
                  </div>
                  <div className="truncate text-xs text-amber-700 dark:text-amber-400">
                    Earliest: {expiring[0].title} · {formatDate(expiring[0].endDate)}
                  </div>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-amber-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            )}
          </div>
        )}

        {/* Demand KPIs — what is coming, as against the delivery tiles below */}
        <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Open Pipeline"
            value={formatMoneyMulti(pipelineValue.open.total)}
            note={
              coverageNote(pipelineValue.open.valued, pipelineValue.open.count) ??
              'per month, open stages'
            }
          />
          <KpiCard
            label="Weighted Pipeline"
            value={formatMoneyMulti(pipelineValue.weighted.total)}
            note="by stage win probability"
          />
          <KpiCard
            label="Won This Month"
            value={formatMoneyMulti(pipelineValue.wonThisMonth.total)}
            note={`${pipelineValue.wonThisMonth.count} deal${
              pipelineValue.wonThisMonth.count === 1 ? '' : 's'
            } closed`}
            tone="good"
          />
          <KpiCard
            label="Win Rate"
            value={
              pipelineValue.conversionRate === null
                ? '—'
                : `${pipelineValue.conversionRate}%`
            }
            note={
              pipelineValue.decidedThisMonth === 0
                ? 'nothing decided this month'
                : `of ${pipelineValue.decidedThisMonth} decided this month`
            }
            tone={
              pipelineValue.conversionRate !== null && pipelineValue.conversionRate < 40
                ? 'bad'
                : 'default'
            }
          />
        </div>

        {/* Delivery KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Monthly Billing"
            value={formatMoneyMulti(s.monthlyBilling)}
            sub={`${formatMoneyMulti(s.monthlyGst)} GST · ${formatMoneyMulti(
              // Margin per currency: billing minus commission, never across.
              sumByCurrency([
                ...s.monthlyBilling,
                ...s.monthlyCommission.map((c) => ({
                  currency: c.currency as string,
                  amount: -c.amount,
                })),
              ]),
            )} margin`}
          />
          <Stat
            label="Outstanding"
            value={formatMoneyMulti(inv.outstandingAmount)}
            sub={`${formatMoneyMulti(inv.overdueAmount)} overdue`}
            tone={inv.overdueAmount.length > 0 ? 'bad' : 'default'}
          />
          <Stat
            label="Bench Utilisation"
            value={`${deployedPct}%`}
            sub={`${s.fullyDeployed} full · ${s.partiallyDeployed} partial · ${s.available} free`}
            tone={deployedPct >= 80 ? 'good' : deployedPct >= 50 ? 'warn' : 'bad'}
          />
          <Stat
            label="Active Deployments"
            value={s.billableDeployments + s.shadowDeployments}
            sub={`${s.billableDeployments} billable · ${s.shadowDeployments} shadow`}
          />
        </div>

        {/* Pipeline funnel */}
        <section className="card">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Pipeline</h2>
              <p className="mt-0.5 text-2xs text-ink3">
                {pipeline.openCount} open · {pipeline.openPositions} positions ·{' '}
                {pipeline.filledPositions} filled · {pipeline.won90d}W/
                {pipeline.lost90d}L in 90 days
              </p>
            </div>
            <Link
              href="/pipeline"
              className="text-xs font-medium text-brand hover:underline"
            >
              Open pipeline
            </Link>
          </header>
          <div className="grid grid-cols-3 divide-x divide-y divide-line sm:grid-cols-6 sm:divide-y-0">
            {ACTIVE_STAGES.map((st) => {
              const d = pipeline.byStage[st];
              return (
                <Link
                  key={st}
                  href="/pipeline"
                  className="px-3 py-3 transition-colors hover:bg-surface2/50"
                >
                  <div className="text-2xs font-medium text-ink3">
                    {STAGE_LABELS[st]}
                  </div>
                  <div className="tnum mt-1 text-xl font-semibold text-ink">
                    {d?.count ?? 0}
                  </div>
                  <div className="tnum text-2xs text-ink3">
                    {d?.positions ?? 0} position{(d?.positions ?? 0) === 1 ? '' : 's'}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Secondary counts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Resources" value={s.totalResources} />
          <Stat label="Active Clients" value={s.activeClients} />
          <Stat label="Active Projects" value={s.activeProjects} />
          <Stat
            label="Monthly Commission"
            value={formatMoneyMulti(s.monthlyCommission)}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Resource utilisation — summary first, then only what needs action.
              This panel keeps a fixed height whatever the headcount. */}
          <section className="card lg:col-span-3">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Resource Utilisation</h2>
              <Link
                href="/resources"
                className="text-xs font-medium text-brand hover:underline"
              >
                View all {s.totalResources}
              </Link>
            </header>

            {/* Whole-bench distribution */}
            <div className="border-b border-line px-4 py-4">
              <div className="flex h-3 overflow-hidden rounded-full bg-surface2">
                <div
                  className="bg-emerald-500"
                  style={{ width: `${(s.fullyDeployed / benchTotal) * 100}%` }}
                  title={`${s.fullyDeployed} fully deployed`}
                />
                <div
                  className="bg-amber-500"
                  style={{ width: `${(s.partiallyDeployed / benchTotal) * 100}%` }}
                  title={`${s.partiallyDeployed} partially deployed`}
                />
                <div
                  className="bg-rose-400"
                  style={{ width: `${(s.available / benchTotal) * 100}%` }}
                  title={`${s.available} available`}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-2xs">
                <span className="flex items-center gap-1.5 text-ink2">
                  <span className="h-2 w-2 rounded-sm bg-emerald-500" />
                  <strong className="tnum text-ink">{s.fullyDeployed}</strong> fully
                  deployed
                </span>
                <span className="flex items-center gap-1.5 text-ink2">
                  <span className="h-2 w-2 rounded-sm bg-amber-500" />
                  <strong className="tnum text-ink">{s.partiallyDeployed}</strong>{' '}
                  partially deployed
                </span>
                <span className="flex items-center gap-1.5 text-ink2">
                  <span className="h-2 w-2 rounded-sm bg-rose-400" />
                  <strong className="tnum text-ink">{s.available}</strong> available
                </span>
              </div>
            </div>

            {/* Only the actionable subset */}
            {needsAttention.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink2">
                All {s.totalResources} resources are fully allocated.
              </p>
            ) : (
              <>
                <div className="px-4 pb-1 pt-3 text-2xs font-medium uppercase tracking-wider text-ink3">
                  Has spare capacity · most idle first
                </div>
                <ul className="divide-y divide-line">
                  {needsAttention.slice(0, 8).map((r) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-40 shrink-0">
                        <div className="truncate text-sm font-medium text-ink">
                          {r.name}
                        </div>
                        <div className="truncate text-2xs text-ink3">
                          {r.designation ?? '—'}
                        </div>
                      </div>
                      <AllocationBar billable={r.billable} shadow={r.shadow} />
                      <span className="tnum w-16 shrink-0 text-right text-2xs text-ink2">
                        {r.free}% free
                      </span>
                    </li>
                  ))}
                </ul>
                {needsAttention.length > 8 && (
                  <div className="border-t border-line px-4 py-2.5 text-center">
                    <Link
                      href="/resources"
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      {needsAttention.length - 8} more with spare capacity
                    </Link>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Billing by client */}
          <section className="card lg:col-span-2">
            <header className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Billing by Client</h2>
              <p className="mt-0.5 text-2xs text-ink3">
                Active billable deployments, per month
              </p>
            </header>
            <ul className="divide-y divide-line">
              {billingClients.map((c) => (
                <li key={c.clientId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm font-medium text-ink">
                      {c.clientName}
                    </span>
                    <span className="tnum shrink-0 text-sm font-semibold text-ink">
                      {formatMoneyMulti(c.billing)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface2">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${c.barPercent}%` }}
                    />
                  </div>
                  <div className="mt-1 text-2xs text-ink3">
                    {c.headcount} resource{c.headcount > 1 ? 's' : ''} deployed
                  </div>
                </li>
              ))}
              {billingClients.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-ink3">
                  No active billable deployments yet
                </li>
              )}
            </ul>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Invoice pipeline */}
          <section className="card">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Invoice Pipeline</h2>
              <Link
                href="/invoices"
                className="text-xs font-medium text-brand hover:underline"
              >
                View all
              </Link>
            </header>
            <div className="grid grid-cols-2 divide-x divide-y divide-line">
              {(
                ['not_raised', 'raised', 'pending_collection', 'collected'] as const
              ).map((st) => (
                <div key={st} className="px-4 py-3">
                  <Badge tone={STATUS_TONE[st]}>{INVOICE_STATUS_LABELS[st]}</Badge>
                  <div className="tnum mt-2 text-xl font-semibold text-ink">
                    {inv.byStatus[st]?.count ?? 0}
                  </div>
                  <div className="tnum text-xs text-ink2">
                    {formatMoneyMulti(inv.byStatus[st]?.total)}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Ending soon */}
          <section className="card">
            <header className="border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">Ending Within 30 Days</h2>
              <p className="mt-0.5 text-2xs text-ink3">
                Deployments and agreements needing a renewal decision
              </p>
            </header>
            {endingSoon.length === 0 && expiring.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink3">
                Nothing ending in the next 30 days
              </p>
            ) : (
              <TableShell>
                <tbody className="divide-y divide-line">
                  {endingSoon.map((d) => {
                    const days = daysUntil(d.endDate);
                    return (
                      <tr key={`d${d.id}`}>
                        <td className="td">
                          <div className="font-medium text-ink">{d.resourceName}</div>
                          <div className="text-2xs text-ink3">
                            {d.projectName} · {d.clientName}
                          </div>
                        </td>
                        <td className="td">
                          <Badge
                            tone={d.deploymentType === 'shadow' ? 'amber' : 'green'}
                          >
                            {d.deploymentType === 'shadow' ? 'Shadow' : 'Billable'}{' '}
                            {d.allocationPercentage}%
                          </Badge>
                        </td>
                        <td className="td text-right">
                          <div className="tnum font-medium text-ink">
                            {formatDate(d.endDate)}
                          </div>
                          <div
                            className={`text-2xs ${days !== null && days <= 7 ? 'text-rose-600 dark:text-rose-400' : 'text-ink3'}`}
                          >
                            {days !== null && days >= 0
                              ? `in ${days} day${days === 1 ? '' : 's'}`
                              : 'overdue'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {expiring.map((a) => {
                    const days = daysUntil(a.endDate);
                    return (
                      <tr key={`a${a.id}`}>
                        <td className="td">
                          <div className="font-medium text-ink">{a.title}</div>
                          <div className="text-2xs text-ink3">
                            {a.agreementNumber ?? '—'} · {a.clientName}
                          </div>
                        </td>
                        <td className="td">
                          <Badge tone="violet">Agreement v{a.renewalVersion}</Badge>
                        </td>
                        <td className="td text-right">
                          <div className="tnum font-medium text-ink">
                            {formatDate(a.endDate)}
                          </div>
                          <div
                            className={`text-2xs ${days !== null && days <= 7 ? 'text-rose-600 dark:text-rose-400' : 'text-ink3'}`}
                          >
                            {days !== null && days >= 0
                              ? `in ${days} day${days === 1 ? '' : 's'}`
                              : 'expired'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </TableShell>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
