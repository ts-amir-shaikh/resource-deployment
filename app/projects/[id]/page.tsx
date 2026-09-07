import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, clients, agreements, invoices, deployments, resources } from '@/lib/schema';
import {
  formatMoney,
  formatMoneyMulti,
  formatDate,
  sumByCurrency,
  INVOICE_STATUS_LABELS,
} from '@/lib/utils';
import { Badge, TableShell } from '@/components/ui';
import {
  DetailHeader,
  DetailSection,
  DetailFacts,
  ContactCard,
  DetailEmpty,
} from '@/components/detail';

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [row, team, agreementRows, invoiceRows] = await Promise.all([
    db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        projectName: projects.projectName,
        managerName: projects.managerName,
        managerEmail: projects.managerEmail,
        managerMobile: projects.managerMobile,
        managerDesignation: projects.managerDesignation,
        createdAt: projects.createdAt,
        clientName: clients.companyName,
      })
      .from(projects)
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .where(eq(projects.id, id))
      .get(),
    db
      .select({
        id: deployments.id,
        resourceId: deployments.resourceId,
        resourceName: resources.name,
        designation: resources.designation,
        deploymentType: deployments.deploymentType,
        allocationPercentage: deployments.allocationPercentage,
        startDate: deployments.startDate,
        endDate: deployments.endDate,
        currency: deployments.currency,
        billingAmount: deployments.billingAmount,
        status: deployments.status,
      })
      .from(deployments)
      .innerJoin(resources, eq(deployments.resourceId, resources.id))
      .where(eq(deployments.projectId, id))
      .orderBy(desc(deployments.startDate))
      .all(),
    db
      .select()
      .from(agreements)
      .where(eq(agreements.projectId, id))
      .orderBy(desc(agreements.id))
      .all(),
    db
      .select()
      .from(invoices)
      .where(eq(invoices.projectId, id))
      .orderBy(desc(invoices.id))
      .all(),
  ]);

  if (!row) notFound();

  const active = team.filter((t) => t.status === 'active');
  const billing = sumByCurrency(
    active
      .filter((t) => t.deploymentType === 'billable')
      .map((t) => ({ currency: t.currency, amount: t.billingAmount })),
  );

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/projects"
        backLabel="Back to projects"
        title={row.projectName}
        subtitle={
          <Link href={`/clients/${row.clientId}`} className="text-brand hover:underline">
            {row.clientName}
          </Link>
        }
        badges={<Badge tone="blue">{active.length} active</Badge>}
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Deployed Team" count={team.length}>
            {team.length === 0 ? (
              <DetailEmpty>Nobody deployed to this project yet.</DetailEmpty>
            ) : (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Resource</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Allocation</th>
                    <th className="th">Period</th>
                    <th className="th text-right">Billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {team.map((t) => (
                    <tr key={t.id} className={t.status === 'ended' ? 'opacity-60' : ''}>
                      <td className="td">
                        <Link
                          href={`/resources/${t.resourceId}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {t.resourceName}
                        </Link>
                        <div className="text-2xs text-ink3">{t.designation ?? '—'}</div>
                      </td>
                      <td className="td">
                        <Badge tone={t.deploymentType === 'shadow' ? 'violet' : 'blue'}>
                          {t.deploymentType}
                        </Badge>
                      </td>
                      <td className="td tnum text-right">{t.allocationPercentage}%</td>
                      <td className="td text-xs text-ink2">
                        {formatDate(t.startDate)} →{' '}
                        {t.endDate ? formatDate(t.endDate) : 'ongoing'}
                      </td>
                      <td className="td tnum text-right">
                        {t.deploymentType === 'shadow'
                          ? '—'
                          : formatMoney(t.billingAmount, t.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </DetailSection>

          <DetailSection title="Agreements & POs" count={agreementRows.length}>
            {agreementRows.length === 0 ? (
              <DetailEmpty>No agreements raised against this project.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {agreementRows.map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <Link
                        href={`/agreements/${a.id}`}
                        className="text-sm font-medium text-ink hover:text-brand"
                      >
                        {a.title}
                      </Link>
                      <div className="text-2xs text-ink3">
                        {a.agreementNumber ? `${a.agreementNumber} · ` : ''}
                        v{a.renewalVersion} · {formatDate(a.startDate)} →{' '}
                        {formatDate(a.endDate)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-sm text-ink">
                        {formatMoney(a.value, a.currency)}
                      </div>
                      <Badge tone={a.status === 'active' ? 'green' : 'neutral'}>
                        {a.status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Invoices" count={invoiceRows.length}>
            {invoiceRows.length === 0 ? (
              <DetailEmpty>No invoices raised.</DetailEmpty>
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
          <DetailSection title="Project Manager">
            <div className="p-4">
              <ContactCard
                role="Manager"
                name={row.managerName}
                email={row.managerEmail}
                mobile={row.managerMobile}
                designation={row.managerDesignation}
              />
            </div>
          </DetailSection>

          <DetailSection title="At a Glance">
            <DetailFacts
              columns={2}
              facts={[
                ['Client', row.clientName],
                ['Monthly Billing', formatMoneyMulti(billing)],
                ['Active', `${active.length} deployed`],
                ['Agreements', agreementRows.length],
                ['Invoices', invoiceRows.length],
                ['Created', formatDate(row.createdAt?.slice(0, 10))],
              ]}
            />
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
