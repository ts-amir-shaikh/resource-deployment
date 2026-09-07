import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agreements, projects, clients, invoices, deployments, resources } from '@/lib/schema';
import { getAgreementChain, getAgreementResources } from '@/lib/queries';
import {
  formatMoney,
  formatDate,
  daysUntil,
  INVOICE_STATUS_LABELS,
} from '@/lib/utils';
import { Badge, TableShell } from '@/components/ui';
import {
  DetailHeader,
  DetailSection,
  DetailFacts,
  DetailEmpty,
} from '@/components/detail';

export const dynamic = 'force-dynamic';

export default async function AgreementDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const row = await db
    .select({
      id: agreements.id,
      projectId: agreements.projectId,
      clientId: projects.clientId,
      parentAgreementId: agreements.parentAgreementId,
      agreementNumber: agreements.agreementNumber,
      title: agreements.title,
      scope: agreements.scope,
      currency: agreements.currency,
      value: agreements.value,
      startDate: agreements.startDate,
      endDate: agreements.endDate,
      renewalVersion: agreements.renewalVersion,
      status: agreements.status,
      notes: agreements.notes,
      createdAt: agreements.createdAt,
      projectName: projects.projectName,
      clientName: clients.companyName,
    })
    .from(agreements)
    .innerJoin(projects, eq(agreements.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(agreements.id, id))
    .get();

  if (!row) notFound();

  const [rateCard, chain, invoiceRows, deploymentRows] = await Promise.all([
    getAgreementResources(id),
    getAgreementChain(id),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.agreementId, id))
      .orderBy(desc(invoices.periodFrom))
      .all(),
    db
      .select({
        id: deployments.id,
        resourceId: deployments.resourceId,
        resourceName: resources.name,
        allocationPercentage: deployments.allocationPercentage,
        currency: deployments.currency,
        billingAmount: deployments.billingAmount,
        status: deployments.status,
      })
      .from(deployments)
      .innerJoin(resources, eq(deployments.resourceId, resources.id))
      .where(eq(deployments.agreementId, id))
      .all(),
  ]);

  const cardTotal = rateCard.reduce((s, r) => s + r.billingAmount, 0);
  const daysLeft = row.status === 'active' ? daysUntil(row.endDate) : null;

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/agreements"
        backLabel="Back to agreements"
        title={row.title}
        subtitle={
          <>
            <Link href={`/projects/${row.projectId}`} className="text-brand hover:underline">
              {row.projectName}
            </Link>
            {' · '}
            <Link href={`/clients/${row.clientId}`} className="text-brand hover:underline">
              {row.clientName}
            </Link>
            {row.agreementNumber && (
              <span className="ml-2 font-mono text-xs text-ink3">{row.agreementNumber}</span>
            )}
          </>
        }
        badges={
          <>
            <Badge tone="neutral">v{row.renewalVersion}</Badge>
            <Badge
              tone={
                row.status === 'active' ? 'green' : row.status === 'renewed' ? 'blue' : 'neutral'
              }
            >
              {row.status}
            </Badge>
            {daysLeft !== null && daysLeft <= 30 && (
              <Badge tone="rose">
                {daysLeft < 0 ? 'expired' : `${daysLeft}d to expiry`}
              </Badge>
            )}
          </>
        }
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Terms">
            <DetailFacts
              facts={[
                ['Scope', row.scope],
                ['Currency', row.currency],
                ['Value', formatMoney(row.value, row.currency)],
                ['Start Date', formatDate(row.startDate)],
                ['End Date', formatDate(row.endDate)],
                ['Version', `v${row.renewalVersion}`],
              ]}
            />
            {row.notes && (
              <div className="border-t border-line px-4 py-3">
                <div className="text-2xs font-medium uppercase tracking-wider text-ink3">
                  Notes
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink2">
                  {row.notes}
                </p>
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="Rate Card"
            count={rateCard.length}
            hint="What each resource is billed at under this PO"
          >
            {rateCard.length === 0 ? (
              <DetailEmpty>No resources registered.</DetailEmpty>
            ) : (
              <>
                <TableShell>
                  <thead className="border-b border-line bg-surface2">
                    <tr>
                      <th className="th">Resource</th>
                      <th className="th">Designation</th>
                      <th className="th text-right">Rate / month</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rateCard.map((r) => (
                      <tr key={r.id}>
                        <td className="td">
                          <Link
                            href={`/resources/${r.resourceId}`}
                            className="font-medium text-ink hover:text-brand"
                          >
                            {r.resourceName}
                          </Link>
                        </td>
                        <td className="td text-xs text-ink2">{r.designation ?? '—'}</td>
                        <td className="td tnum text-right">
                          {formatMoney(r.billingAmount, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                <div className="flex items-baseline justify-between border-t border-line px-4 py-2.5">
                  <span className="text-xs text-ink2">Rate card total</span>
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatMoney(cardTotal, row.currency)}
                  </span>
                </div>
              </>
            )}
          </DetailSection>

          <DetailSection
            title="Invoices Raised"
            count={invoiceRows.length}
            hint="Against this version of the agreement"
          >
            {invoiceRows.length === 0 ? (
              <DetailEmpty>Nothing invoiced yet.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {invoiceRows.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/invoices/${i.id}`}
                        className="font-mono text-xs font-medium text-ink hover:text-brand"
                      >
                        {i.invoiceNumber ?? `#${i.id}`}
                      </Link>
                      <div className="text-2xs text-ink3">
                        {formatDate(i.periodFrom)} → {formatDate(i.periodTo)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-sm text-ink">
                        {formatMoney(i.amount + i.gstAmount, i.currency)}
                      </div>
                      <Badge tone={i.status === 'collected' ? 'green' : 'amber'}>
                        {INVOICE_STATUS_LABELS[i.status]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection
            title="Renewal Chain"
            count={chain.length}
            hint="Every version, oldest first"
          >
            <ul className="divide-y divide-line">
              {chain.map((v) => (
                <li
                  key={v.id}
                  className={`px-4 py-2.5 ${v.id === row.id ? 'bg-brandbg' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    {v.id === row.id ? (
                      <span className="text-sm font-semibold text-brand">
                        v{v.renewalVersion} · current
                      </span>
                    ) : (
                      <Link
                        href={`/agreements/${v.id}`}
                        className="text-sm font-medium text-ink hover:text-brand"
                      >
                        v{v.renewalVersion}
                      </Link>
                    )}
                    <span className="tnum shrink-0 text-xs text-ink2">
                      {formatMoney(v.value, v.currency)}
                    </span>
                  </div>
                  <div className="text-2xs text-ink3">
                    {formatDate(v.startDate)} → {formatDate(v.endDate)} · {v.status}
                  </div>
                </li>
              ))}
            </ul>
          </DetailSection>

          <DetailSection title="Deployments" count={deploymentRows.length}>
            {deploymentRows.length === 0 ? (
              <DetailEmpty>Nothing mapped to this PO.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {deploymentRows.map((d) => (
                  <li key={d.id} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/deployments/${d.id}`}
                        className="truncate text-sm font-medium text-ink hover:text-brand"
                      >
                        {d.resourceName}
                      </Link>
                      <span className="tnum shrink-0 text-xs text-ink2">
                        {formatMoney(d.billingAmount, d.currency)}
                      </span>
                    </div>
                    <div className="text-2xs text-ink3">
                      {d.allocationPercentage}% · {d.status}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
