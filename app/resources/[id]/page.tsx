import { notFound } from 'next/navigation';
import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { resources, deployments, projects, clients, agreements } from '@/lib/schema';
import { getResourceAllocation } from '@/lib/queries';
import { formatMoney, formatDate, parseSkills, GST_RATE } from '@/lib/utils';
import { Badge, AllocationBar, TableShell } from '@/components/ui';
import {
  DetailHeader,
  DetailSection,
  DetailFacts,
  DetailEmpty,
} from '@/components/detail';

export const dynamic = 'force-dynamic';

export default async function ResourceDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [row, engagements, allocation] = await Promise.all([
    db.select().from(resources).where(eq(resources.id, id)).get(),
    db
      .select({
        id: deployments.id,
        projectId: deployments.projectId,
        projectName: projects.projectName,
        clientName: clients.companyName,
        agreementNumber: agreements.agreementNumber,
        deploymentType: deployments.deploymentType,
        allocationPercentage: deployments.allocationPercentage,
        startDate: deployments.startDate,
        endDate: deployments.endDate,
        currency: deployments.currency,
        billingAmount: deployments.billingAmount,
        commissionAmount: deployments.commissionAmount,
        gstApplicable: deployments.gstApplicable,
        status: deployments.status,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .innerJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(agreements, eq(deployments.agreementId, agreements.id))
      .where(eq(deployments.resourceId, id))
      .orderBy(desc(deployments.startDate))
      .all(),
    getResourceAllocation(id),
  ]);

  if (!row) notFound();

  const skills = parseSkills(row.otherSkills);
  const active = engagements.filter((e) => e.status === 'active');

  return (
    <div className="pb-12">
      <DetailHeader
        backHref="/resources"
        backLabel="Back to resources"
        title={row.name}
        subtitle={row.designation ?? 'No designation recorded'}
        badges={
          <>
            {allocation.total >= 100 && <Badge tone="green">Fully deployed</Badge>}
            {allocation.total > 0 && allocation.total < 100 && (
              <Badge tone="amber">{allocation.free}% free</Badge>
            )}
            {allocation.total === 0 && <Badge tone="neutral">On bench</Badge>}
          </>
        }
      />

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Profile">
            <DetailFacts
              facts={[
                ['Email', <a key="e" href={`mailto:${row.email}`} className="text-brand hover:underline">{row.email}</a>],
                ['Mobile', row.mobile],
                ['Designation', row.designation],
                ['Primary Skill', row.primarySkill],
                ['Secondary Skill', row.secondarySkill],
                [
                  'Other Skills',
                  skills.length ? (
                    <span key="s" className="flex flex-wrap gap-1">
                      {skills.map((sk) => (
                        <Badge key={sk} tone="neutral">
                          {sk}
                        </Badge>
                      ))}
                    </span>
                  ) : null,
                ],
              ]}
            />
          </DetailSection>

          <DetailSection
            title="Engagements"
            count={engagements.length}
            hint="Every deployment this resource has held, newest first"
          >
            {engagements.length === 0 ? (
              <DetailEmpty>Never deployed.</DetailEmpty>
            ) : (
              <TableShell>
                <thead className="border-b border-line bg-surface2">
                  <tr>
                    <th className="th">Project</th>
                    <th className="th">Type</th>
                    <th className="th text-right">Allocation</th>
                    <th className="th">Period</th>
                    <th className="th text-right">Billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {engagements.map((e) => (
                    <tr key={e.id} className={e.status === 'ended' ? 'opacity-60' : ''}>
                      <td className="td">
                        <Link
                          href={`/deployments/${e.id}`}
                          className="font-medium text-ink hover:text-brand"
                        >
                          {e.projectName}
                        </Link>
                        <div className="text-2xs text-ink3">
                          {e.clientName}
                          {e.agreementNumber ? ` · PO ${e.agreementNumber}` : ''}
                        </div>
                      </td>
                      <td className="td">
                        <Badge tone={e.deploymentType === 'shadow' ? 'violet' : 'blue'}>
                          {e.deploymentType}
                        </Badge>
                      </td>
                      <td className="td tnum text-right">{e.allocationPercentage}%</td>
                      <td className="td text-xs text-ink2">
                        {formatDate(e.startDate)} →{' '}
                        {e.endDate ? formatDate(e.endDate) : 'ongoing'}
                      </td>
                      <td className="td tnum text-right">
                        {e.deploymentType === 'shadow'
                          ? '—'
                          : formatMoney(e.billingAmount, e.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            )}
          </DetailSection>
        </div>

        <div className="space-y-6">
          <DetailSection title="Utilisation">
            <div className="p-4">
              <AllocationBar billable={allocation.billable} shadow={allocation.shadow} />
              <p className="mt-2 text-xs text-ink2">
                {allocation.total}% allocated across {active.length} active deployment
                {active.length === 1 ? '' : 's'} ·{' '}
                <strong className="text-ink">{allocation.free}% free</strong>
              </p>
            </div>
          </DetailSection>

          <DetailSection title="Compensation" hint="Payroll — always in rupees">
            <DetailFacts
              columns={2}
              facts={[
                ['Current CTC', formatMoney(row.currentCtc, 'INR')],
                ['Revised CTC', formatMoney(row.revisedCtc, 'INR')],
                ['Effective From', formatDate(row.revisedEffectiveFrom)],
                ['Added', formatDate(row.createdAt?.slice(0, 10))],
              ]}
            />
          </DetailSection>

          <DetailSection title="Monthly Billing" hint="Active billable deployments only">
            <div className="space-y-2 p-4">
              {active.filter((e) => e.deploymentType === 'billable').length === 0 ? (
                <p className="text-sm text-ink3">Not currently billable.</p>
              ) : (
                active
                  .filter((e) => e.deploymentType === 'billable')
                  .map((e) => (
                    <div key={e.id} className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-xs text-ink2">{e.clientName}</span>
                      <span className="tnum shrink-0 text-sm font-medium text-ink">
                        {formatMoney(e.billingAmount, e.currency)}
                        {e.gstApplicable && (
                          <span className="ml-1 text-2xs font-normal text-ink3">
                            +{formatMoney(e.billingAmount * GST_RATE, e.currency)} GST
                          </span>
                        )}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
