import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  invoices,
  invoiceResources,
  projects,
  clients,
  agreements,
  resources,
} from '@/lib/schema';
import {
  formatMoney,
  formatDate,
  isInvoiceOverdue,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_ORDER,
} from '@/lib/utils';
import { Badge, TableShell } from '@/components/ui';
import {
  DetailHeader,
  DetailSection,
  DetailFacts,
  DetailEmpty,
} from '@/components/detail';

export const dynamic = 'force-dynamic';

export default async function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const row = await db
    .select({
      id: invoices.id,
      projectId: invoices.projectId,
      agreementId: invoices.agreementId,
      clientId: projects.clientId,
      invoiceNumber: invoices.invoiceNumber,
      scope: invoices.scope,
      periodFrom: invoices.periodFrom,
      periodTo: invoices.periodTo,
      currency: invoices.currency,
      fxRateToInr: invoices.fxRateToInr,
      amount: invoices.amount,
      gstAmount: invoices.gstAmount,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      collectedDate: invoices.collectedDate,
      status: invoices.status,
      notes: invoices.notes,
      createdAt: invoices.createdAt,
      projectName: projects.projectName,
      clientName: clients.companyName,
      agreementNumber: agreements.agreementNumber,
      agreementTitle: agreements.title,
    })
    .from(invoices)
    .innerJoin(projects, eq(invoices.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(agreements, eq(invoices.agreementId, agreements.id))
    .where(eq(invoices.id, id))
    .get();

  if (!row) notFound();

  const covered = await db
    .select({
      resourceId: resources.id,
      resourceName: resources.name,
      designation: resources.designation,
      monthlyRate: invoiceResources.monthlyRate,
      workingDays: invoiceResources.workingDays,
      leaveDays: invoiceResources.leaveDays,
      deploymentDate: invoiceResources.deploymentDate,
      lastWorkingDate: invoiceResources.lastWorkingDate,
      billedDays: invoiceResources.billedDays,
      lineAmount: invoiceResources.amount,
    })
    .from(invoiceResources)
    .innerJoin(resources, eq(invoiceResources.resourceId, resources.id))
    .where(eq(invoiceResources.invoiceId, id))
    .all();

  // Lines saved before the day-count fields existed carry no rate and no
  // amount, so their columns would read as a row of zeros — which is a
  // stronger claim than "we don't know". Those invoices are shown as the bare
  // list of names they were.
  const itemised = covered.some((c) => c.lineAmount > 0 || c.monthlyRate > 0);
  const lineTotal = covered.reduce((s, c) => s + c.lineAmount, 0);

  const overdue = isInvoiceOverdue(row.status, row.dueDate);
  const total = row.amount + row.gstAmount;
  const currentStage = INVOICE_STATUS_ORDER.indexOf(row.status);

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/invoices"
        backLabel="Back to invoices"
        title={row.invoiceNumber ?? `Invoice #${row.id}`}
        subtitle={
          <>
            <Link href={`/projects/${row.projectId}`} className="text-brand hover:underline">
              {row.projectName}
            </Link>
            {' · '}
            <Link href={`/clients/${row.clientId}`} className="text-brand hover:underline">
              {row.clientName}
            </Link>
          </>
        }
        badges={
          <>
            <Badge tone={row.status === 'collected' ? 'green' : 'amber'}>
              {INVOICE_STATUS_LABELS[row.status]}
            </Badge>
            {overdue && <Badge tone="rose">overdue</Badge>}
          </>
        }
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Amounts">
            <DetailFacts
              columns={4}
              facts={[
                ['Currency', row.currency],
                ['Amount', formatMoney(row.amount, row.currency)],
                ['GST', formatMoney(row.gstAmount, row.currency)],
                ['Total', formatMoney(total, row.currency)],
              ]}
            />
            {row.currency !== 'INR' && (
              <div className="border-t border-line px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-ink2">
                    Rate locked when raised — 1 {row.currency}
                  </span>
                  <span className="tnum text-sm text-ink">
                    {formatMoney(row.fxRateToInr, 'INR')}
                  </span>
                </div>
                <p className="mt-1 text-2xs text-ink3">
                  Held for later consolidated reporting. Nothing on this page is
                  converted — the invoice stands in {row.currency}.
                </p>
              </div>
            )}
          </DetailSection>

          <DetailSection
            title="Resources Covered"
            count={covered.length}
            hint={
              itemised
                ? 'Each line priced on its own day count for this period'
                : 'An invoice need not cover every resource on the agreement'
            }
          >
            {covered.length === 0 ? (
              <DetailEmpty>
                No specific resources tagged — this invoice is not itemised.
              </DetailEmpty>
            ) : !itemised ? (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Resource</th>
                    <th className="th">Designation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {covered.map((c) => (
                    <tr key={c.resourceId}>
                      <td className="td">
                        <Link
                          href={`/resources/${c.resourceId}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {c.resourceName}
                        </Link>
                      </td>
                      <td className="td text-xs text-ink2">{c.designation ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            ) : (
              <>
                <TableShell>
                  <thead className="border-b border-line bg-surface2">
                    <tr>
                      <th className="th">Resource</th>
                      <th className="th text-right">Rate/mo</th>
                      <th className="th text-right">Days billed</th>
                      <th className="th">Leave</th>
                      <th className="th">On the engagement</th>
                      <th className="th text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {covered.map((c) => (
                      <tr key={c.resourceId}>
                        <td className="td">
                          <Link
                            href={`/resources/${c.resourceId}`}
                            className="font-medium text-ink hover:text-brand"
                          >
                            {c.resourceName}
                          </Link>
                          <div className="text-2xs text-ink3">{c.designation ?? '—'}</div>
                        </td>
                        <td className="td tnum text-right text-ink2">
                          {formatMoney(c.monthlyRate, row.currency)}
                        </td>
                        <td className="td tnum text-right">
                          {c.workingDays == null || c.billedDays == null ? (
                            <span className="text-xs text-ink3">Full month</span>
                          ) : (
                            <span
                              className={
                                c.billedDays < c.workingDays
                                  ? 'font-medium text-amber-700 dark:text-amber-400'
                                  : 'text-ink'
                              }
                            >
                              {c.billedDays} / {c.workingDays}
                            </span>
                          )}
                        </td>
                        <td className="td tnum text-xs text-ink2">
                          {c.leaveDays > 0 ? `${c.leaveDays}d` : '—'}
                        </td>
                        <td className="td text-xs text-ink2">
                          {c.deploymentDate || c.lastWorkingDate ? (
                            <>
                              {c.deploymentDate
                                ? `from ${formatDate(c.deploymentDate)}`
                                : 'from period start'}
                              <div className="text-2xs text-ink3">
                                {c.lastWorkingDate
                                  ? `to ${formatDate(c.lastWorkingDate)}`
                                  : 'to period end'}
                              </div>
                            </>
                          ) : (
                            'Whole period'
                          )}
                        </td>
                        <td className="td tnum text-right font-medium text-ink">
                          {formatMoney(c.lineAmount, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                <div className="flex items-baseline justify-between border-t border-line px-4 py-2.5">
                  <span className="text-xs text-ink2">Lines total (pre-GST)</span>
                  <span className="tnum text-sm font-semibold text-ink">
                    {formatMoney(lineTotal, row.currency)}
                  </span>
                </div>
                {Math.round(lineTotal) !== Math.round(row.amount) && (
                  <p className="border-t border-line px-4 py-2 text-2xs text-amber-700 dark:text-amber-400">
                    The invoice was raised at {formatMoney(row.amount, row.currency)}{' '}
                    pre-GST, which differs from the lines above. The invoice amount is
                    what the client was billed.
                  </p>
                )}
              </>
            )}
          </DetailSection>

          <DetailSection title="Billing Period & Dates">
            <DetailFacts
              facts={[
                ['Period From', formatDate(row.periodFrom)],
                ['Period To', formatDate(row.periodTo)],
                ['Scope', row.scope],
                ['Invoice Date', formatDate(row.invoiceDate)],
                ['Due Date', formatDate(row.dueDate)],
                ['Collected', formatDate(row.collectedDate)],
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
        </div>

        <div className="space-y-6">
          <DetailSection title="Status" hint="Moves forward only">
            <ol className="p-4">
              {INVOICE_STATUS_ORDER.map((st, i) => {
                const done = i <= currentStage;
                return (
                  <li key={st} className="flex items-start gap-2.5 pb-3 last:pb-0">
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-2xs ${
                        done ? 'bg-brand text-white' : 'border border-line text-ink3'
                      }`}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span
                      className={`text-sm ${done ? 'font-medium text-ink' : 'text-ink3'}`}
                    >
                      {INVOICE_STATUS_LABELS[st]}
                    </span>
                  </li>
                );
              })}
            </ol>
          </DetailSection>

          <DetailSection title="Agreement / PO">
            {row.agreementId ? (
              <div className="p-4">
                <Link
                  href={`/agreements/${row.agreementId}`}
                  className="text-sm font-medium text-ink hover:text-brand"
                >
                  {row.agreementTitle}
                </Link>
                {row.agreementNumber && (
                  <div className="font-mono text-2xs text-ink3">{row.agreementNumber}</div>
                )}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-ink3">
                Raised without an agreement — amounts were entered by hand.
              </p>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
