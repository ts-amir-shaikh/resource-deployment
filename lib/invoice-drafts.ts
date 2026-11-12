import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Executor } from './db';
import { deployments, invoiceResources, invoices, projects } from './schema';
import { draftKey, monthBounds, workingDaysInMonth } from './invoice-drafts-rules';
import { GST_RATE, invoiceLineRow } from './utils';

/**
 * M62 slice C (G-ACC-06): drafts the month's invoices from billable
 * deployments. Each draft is a Not Raised invoice, listed for review; nothing
 * is raised. Billed days and amounts come from the same line maths every
 * invoice uses, recomputed here, and leave from approved timesheets when they
 * cover the month. Running it twice creates nothing new: a project, agreement
 * and currency that already has an invoice for the period is skipped.
 */

export type LeaveFor = <L extends { resourceId: number; paidLeaveDays: number; unpaidLeaveDays: number }>(
  tx: Executor,
  line: L,
  invoice: { projectId: number; periodFrom: string; periodTo: string },
) => Promise<L & { leaveFromTimesheet: boolean }>;

export type DraftDeps = {
  /** Holiday dates in the range for the company and these clients. */
  holidaysFor: (tx: Executor, from: string, to: string, clientIds: number[]) => Promise<Set<string>>;
  leaveFor: LeaveFor;
};

export type DraftResult = {
  period: { from: string; to: string };
  created: { invoiceId: number; projectId: number; currency: string; amount: number; lines: number }[];
  skipped: { projectId: number; currency: string; reason: string }[];
};

export async function buildMonthlyDrafts(tx: Executor, month: string, deps: DraftDeps): Promise<DraftResult> {
  const period = monthBounds(month);
  const result: DraftResult = { period, created: [], skipped: [] };

  const rows = await tx
    .select({
      resourceId: deployments.resourceId,
      projectId: deployments.projectId,
      agreementId: deployments.agreementId,
      currency: deployments.currency,
      billingAmount: deployments.billingAmount,
      startDate: deployments.startDate,
      endDate: deployments.endDate,
      clientId: projects.clientId,
    })
    .from(deployments)
    .innerJoin(projects, eq(deployments.projectId, projects.id))
    .where(
      and(
        eq(deployments.deploymentType, 'billable'),
        lte(deployments.startDate, period.to),
        or(isNull(deployments.endDate), gte(deployments.endDate, period.from)),
      ),
    )
    .orderBy(deployments.projectId, deployments.resourceId)
    .all();

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!(r.billingAmount > 0)) continue;
    const k = draftKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  for (const members of groups.values()) {
    const { projectId, agreementId, currency, clientId } = members[0];

    // Locked rate is captured when an invoice is created and cannot be guessed.
    if (currency !== 'INR') {
      result.skipped.push({ projectId, currency, reason: 'Foreign-currency invoices need an exchange rate, so raise this one by hand.' });
      continue;
    }

    const existing = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.projectId, projectId),
          eq(invoices.periodFrom, period.from),
          eq(invoices.periodTo, period.to),
          eq(invoices.currency, currency as never),
          agreementId === null ? isNull(invoices.agreementId) : eq(invoices.agreementId, agreementId),
        ),
      )
      .get();
    if (existing) {
      result.skipped.push({ projectId, currency, reason: 'An invoice for this period already exists.' });
      continue;
    }

    const hol = await deps.holidaysFor(tx, period.from, period.to, [clientId]);
    const workingDays = workingDaysInMonth(period.from, period.to, hol);

    // A resource on two deployments in one group appears once, on the later one.
    const byResource = new Map<number, (typeof members)[number]>();
    for (const m of members) byResource.set(m.resourceId, m);

    const lines = [];
    for (const m of byResource.values()) {
      const typed = {
        resourceId: m.resourceId,
        monthlyRate: m.billingAmount,
        workingDays,
        paidLeaveDays: 0,
        unpaidLeaveDays: 0,
        deploymentDate: m.startDate > period.from ? m.startDate : undefined,
        lastWorkingDate: m.endDate && m.endDate < period.to ? m.endDate : undefined,
      };
      const { leaveFromTimesheet, ...withLeave } = await deps.leaveFor(
        tx,
        typed,
        { projectId, periodFrom: period.from, periodTo: period.to },
      );
      lines.push({ ...invoiceLineRow(withLeave, { periodFrom: period.from, periodTo: period.to }), leaveFromTimesheet });
    }

    const amount = lines.reduce((s, l) => s + l.amount, 0);
    if (!(amount > 0)) {
      result.skipped.push({ projectId, currency, reason: 'Nothing to bill: every line comes to zero.' });
      continue;
    }

    const inv = await tx
      .insert(invoices)
      .values({
        projectId,
        agreementId,
        scope: lines.length > 1 ? 'team' : 'individual',
        periodFrom: period.from,
        periodTo: period.to,
        currency: currency as never,
        fxRateToInr: 1,
        amount,
        gstAmount: Math.round(amount * GST_RATE),
        status: 'not_raised',
        notes: `Drafted from active deployments for ${month}. Review before raising.`,
      })
      .returning({ id: invoices.id })
      .get();
    for (const l of lines) await tx.insert(invoiceResources).values({ invoiceId: inv.id, ...l }).run();
    result.created.push({ invoiceId: inv.id, projectId, currency, amount, lines: lines.length });
  }
  return result;
}
