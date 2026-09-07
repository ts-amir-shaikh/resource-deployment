import { notFound } from 'next/navigation';
import Link from 'next/link';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  deployments,
  resources,
  projects,
  clients,
  agreements,
  agreementResources,
} from '@/lib/schema';
import { deploymentBilling, getResourceAllocation } from '@/lib/queries';
import { formatMoney, formatDate } from '@/lib/utils';
import { Badge, AllocationBar } from '@/components/ui';
import { DetailHeader, DetailSection, DetailFacts } from '@/components/detail';

export const dynamic = 'force-dynamic';

export default async function DeploymentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const row = await db
    .select({
      id: deployments.id,
      resourceId: deployments.resourceId,
      projectId: deployments.projectId,
      agreementId: deployments.agreementId,
      clientId: projects.clientId,
      resourceName: resources.name,
      resourceEmail: resources.email,
      designation: resources.designation,
      projectName: projects.projectName,
      clientName: clients.companyName,
      agreementNumber: agreements.agreementNumber,
      agreementTitle: agreements.title,
      deploymentType: deployments.deploymentType,
      allocationPercentage: deployments.allocationPercentage,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      currency: deployments.currency,
      billingAmount: deployments.billingAmount,
      commissionAmount: deployments.commissionAmount,
      gstApplicable: deployments.gstApplicable,
      status: deployments.status,
      createdAt: deployments.createdAt,
    })
    .from(deployments)
    .innerJoin(resources, eq(deployments.resourceId, resources.id))
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .innerJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(agreements, eq(deployments.agreementId, agreements.id))
    .where(eq(deployments.id, id))
    .get();

  if (!row) notFound();

  // The rate this deployment should be billing at according to the PO — shown
  // beside the actual figure, because they can legitimately differ and the
  // difference is exactly what someone reviewing this page wants to see.
  const [cardRate, allocation] = await Promise.all([
    row.agreementId
      ? db
          .select({ billingAmount: agreementResources.billingAmount })
          .from(agreementResources)
          .where(
            and(
              eq(agreementResources.agreementId, row.agreementId),
              eq(agreementResources.resourceId, row.resourceId),
            ),
          )
          .get()
      : Promise.resolve(undefined),
    getResourceAllocation(row.resourceId),
  ]);

  const money = deploymentBilling(row);
  const isShadow = row.deploymentType === 'shadow';
  const rateMismatch =
    cardRate !== undefined && cardRate.billingAmount !== row.billingAmount;

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/deployments"
        backLabel="Back to deployments"
        title={row.resourceName}
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
            <Badge tone={isShadow ? 'violet' : 'blue'}>{row.deploymentType}</Badge>
            <Badge tone={row.status === 'active' ? 'green' : 'neutral'}>{row.status}</Badge>
          </>
        }
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Engagement">
            <DetailFacts
              facts={[
                [
                  'Resource',
                  <Link key="r" href={`/resources/${row.resourceId}`} className="text-brand hover:underline">
                    {row.resourceName}
                  </Link>,
                ],
                ['Designation', row.designation],
                ['Allocation', `${row.allocationPercentage}%`],
                ['Start Date', formatDate(row.startDate)],
                ['End Date', row.endDate ? formatDate(row.endDate) : 'Ongoing'],
                ['Recorded', formatDate(row.createdAt?.slice(0, 10))],
              ]}
            />
          </DetailSection>

          <DetailSection
            title="Billing"
            hint={isShadow ? 'Shadow deployments are not billed' : undefined}
          >
            {isShadow ? (
              <p className="px-4 py-6 text-center text-sm text-ink3">
                This is a shadow deployment — no billing, commission or GST applies.
              </p>
            ) : (
              <>
                <DetailFacts
                  columns={4}
                  facts={[
                    ['Base', formatMoney(money.base, row.currency)],
                    ['GST', formatMoney(money.gst, row.currency)],
                    ['Total', formatMoney(money.total, row.currency)],
                    ['Commission', formatMoney(row.commissionAmount, row.currency)],
                  ]}
                />
                <div className="border-t border-line px-4 py-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-ink2">Margin after commission</span>
                    <span className="tnum text-sm font-semibold text-ink">
                      {formatMoney(money.margin, row.currency)}
                    </span>
                  </div>
                  {!row.gstApplicable && (
                    <p className="mt-1.5 text-2xs text-ink3">
                      GST not applied
                      {row.currency !== 'INR'
                        ? ` — GST is an Indian tax and does not apply to a ${row.currency} engagement.`
                        : '.'}
                    </p>
                  )}
                </div>
              </>
            )}
          </DetailSection>
        </div>

        <div className="space-y-6">
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
                <dl className="mt-3 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-ink3">Rate card</dt>
                    <dd className="tnum text-ink">
                      {cardRate
                        ? formatMoney(cardRate.billingAmount, row.currency)
                        : 'not on this PO'}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink3">Billing here</dt>
                    <dd className="tnum text-ink">
                      {formatMoney(row.billingAmount, row.currency)}
                    </dd>
                  </div>
                </dl>
                {rateMismatch && (
                  <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-2xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
                    This deployment bills at a different rate from the PO rate card.
                    Intentional overrides are allowed — worth a look if not.
                  </p>
                )}
              </div>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-ink3">
                Not linked to an agreement. Invoices raised for this deployment cannot
                draw a rate automatically.
              </p>
            )}
          </DetailSection>

          <DetailSection title="Resource Utilisation">
            <div className="p-4">
              <AllocationBar
                billable={allocation.billable}
                shadow={allocation.shadow}
              />
              <p className="mt-2 text-xs text-ink2">
                {row.resourceName} is {allocation.total}% allocated overall ·{' '}
                <strong className="text-ink">{allocation.free}% free</strong>
              </p>
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
