import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients, projects, agreements, invoices, deployments, resources } from '@/lib/schema';
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

export default async function ClientDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [row, projectRows, agreementRows, invoiceRows, deployed] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, id)).get(),
    db
      .select({
        id: projects.id,
        projectName: projects.projectName,
        managerName: projects.managerName,
      })
      .from(projects)
      .where(eq(projects.clientId, id))
      .orderBy(desc(projects.id))
      .all(),
    db
      .select({
        id: agreements.id,
        agreementNumber: agreements.agreementNumber,
        title: agreements.title,
        currency: agreements.currency,
        value: agreements.value,
        startDate: agreements.startDate,
        endDate: agreements.endDate,
        status: agreements.status,
        projectName: projects.projectName,
      })
      .from(agreements)
      .innerJoin(projects, eq(agreements.projectId, projects.id))
      .where(eq(projects.clientId, id))
      .orderBy(desc(agreements.id))
      .all(),
    db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        currency: invoices.currency,
        amount: invoices.amount,
        gstAmount: invoices.gstAmount,
        status: invoices.status,
        periodFrom: invoices.periodFrom,
        periodTo: invoices.periodTo,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .innerJoin(projects, eq(invoices.projectId, projects.id))
      .where(eq(projects.clientId, id))
      .orderBy(desc(invoices.id))
      .all(),
    db
      .select({
        id: deployments.id,
        resourceName: resources.name,
        designation: resources.designation,
        projectName: projects.projectName,
        deploymentType: deployments.deploymentType,
        allocationPercentage: deployments.allocationPercentage,
        currency: deployments.currency,
        billingAmount: deployments.billingAmount,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(resources, eq(deployments.resourceId, resources.id))
      .where(eq(projects.clientId, id))
      .all(),
  ]);

  if (!row) notFound();

  const active = deployed.filter(() => true);
  const billing = sumByCurrency(
    active
      .filter((d) => d.deploymentType === 'billable')
      .map((d) => ({ currency: d.currency, amount: d.billingAmount })),
  );
  const outstanding = sumByCurrency(
    invoiceRows
      .filter((i) => i.status === 'raised' || i.status === 'pending_collection')
      .map((i) => ({ currency: i.currency, amount: i.amount + i.gstAmount })),
  );
  const collected = sumByCurrency(
    invoiceRows
      .filter((i) => i.status === 'collected')
      .map((i) => ({ currency: i.currency, amount: i.amount + i.gstAmount })),
  );

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/clients"
        backLabel="Back to clients"
        title={row.companyName}
        subtitle={`${projectRows.length} project${projectRows.length === 1 ? '' : 's'} · ${
          new Set(deployed.map((d) => d.resourceName)).size
        } resources deployed`}
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Contacts">
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <ContactCard
                role="SPOC"
                name={row.spocName}
                email={row.spocEmail}
                mobile={row.spocMobile}
                designation={row.spocDesignation}
              />
              <ContactCard
                role="Account"
                name={row.accountName}
                email={row.accountEmail}
                mobile={row.accountMobile}
              />
              <ContactCard
                role="Alternate SPOC"
                name={row.altSpocName}
                email={row.altSpocEmail}
                mobile={row.altSpocMobile}
                designation={row.altSpocDesignation}
              />
            </div>
          </DetailSection>

          <DetailSection title="Projects" count={projectRows.length}>
            {projectRows.length === 0 ? (
              <DetailEmpty>No projects yet.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {projectRows.map((p) => (
                  <li key={p.id} className="px-4 py-3">
                    <Link
                      href={`/projects/${p.id}`}
                      className="text-sm font-medium text-ink hover:text-brand"
                    >
                      {p.projectName}
                    </Link>
                    <div className="text-2xs text-ink3">
                      {p.managerName ? `Manager: ${p.managerName}` : 'No manager recorded'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Agreements & POs" count={agreementRows.length}>
            {agreementRows.length === 0 ? (
              <DetailEmpty>No agreements raised.</DetailEmpty>
            ) : (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Agreement</th>
                    <th className="th">Project</th>
                    <th className="th">Period</th>
                    <th className="th text-right">Value</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {agreementRows.map((a) => (
                    <tr key={a.id}>
                      <td className="td">
                        <Link
                          href={`/agreements/${a.id}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {a.title}
                        </Link>
                        {a.agreementNumber && (
                          <div className="font-mono text-2xs text-ink3">
                            {a.agreementNumber}
                          </div>
                        )}
                      </td>
                      <td className="td text-xs text-ink2">{a.projectName}</td>
                      <td className="td text-xs text-ink2">
                        {formatDate(a.startDate)} → {formatDate(a.endDate)}
                      </td>
                      <td className="td tnum text-right">
                        {formatMoney(a.value, a.currency)}
                      </td>
                      <td className="td">
                        <Badge
                          tone={
                            a.status === 'active'
                              ? 'green'
                              : a.status === 'renewed'
                                ? 'blue'
                                : 'neutral'
                          }
                        >
                          {a.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </DetailSection>

          <DetailSection title="Invoices" count={invoiceRows.length}>
            {invoiceRows.length === 0 ? (
              <DetailEmpty>No invoices raised.</DetailEmpty>
            ) : (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Invoice</th>
                    <th className="th">Period</th>
                    <th className="th text-right">Total</th>
                    <th className="th">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {invoiceRows.map((i) => (
                    <tr key={i.id}>
                      <td className="td">
                        <Link
                          href={`/invoices/${i.id}`}
                          className="font-mono text-xs font-medium text-ink hover:text-brand"
                        >
                          {i.invoiceNumber ?? `#${i.id}`}
                        </Link>
                      </td>
                      <td className="td text-xs text-ink2">
                        {formatDate(i.periodFrom)} → {formatDate(i.periodTo)}
                      </td>
                      <td className="td tnum text-right">
                        {formatMoney(i.amount + i.gstAmount, i.currency)}
                      </td>
                      <td className="td">
                        <Badge tone={i.status === 'collected' ? 'green' : 'amber'}>
                          {INVOICE_STATUS_LABELS[i.status]}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection title="Commercials" hint="Each currency kept separate">
            <DetailFacts
              columns={2}
              facts={[
                ['Monthly Billing', formatMoneyMulti(billing)],
                ['Outstanding', formatMoneyMulti(outstanding)],
                ['Collected', formatMoneyMulti(collected)],
                ['Invoices', invoiceRows.length],
              ]}
            />
          </DetailSection>

          <DetailSection title="Deployed Team" count={deployed.length}>
            {deployed.length === 0 ? (
              <DetailEmpty>Nobody deployed.</DetailEmpty>
            ) : (
              <ul className="divide-y divide-line">
                {deployed.map((d) => (
                  <li key={d.id} className="px-4 py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/deployments/${d.id}`}
                        className="truncate text-sm font-medium text-ink hover:text-brand"
                      >
                        {d.resourceName}
                      </Link>
                      <span className="tnum shrink-0 text-xs text-ink2">
                        {d.deploymentType === 'shadow'
                          ? 'shadow'
                          : formatMoney(d.billingAmount, d.currency)}
                      </span>
                    </div>
                    <div className="text-2xs text-ink3">
                      {d.projectName} · {d.allocationPercentage}%
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
