import { and, eq, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { agreements, clients, deployments, projects } from '@/lib/schema';
import { renewalsParams } from './params';
import { addDaysIso, daysBetweenIso } from './dates';
import { paginate } from './paginate';
import { addTo, isCurrency, round2, toMoney, type Currency } from './money';
import type { EndpointSpec } from './handler';
import type { RenewalsReport } from './types';

/**
 * GET /api/reporting/v1/renewals — agreement expiry, deployment end dates and
 * upcoming renewal exposure.
 *
 * Renewal exposure counts CHAIN HEADS only. A renewal inserts a new agreement
 * row with parent_agreement_id and marks the parent "renewed", so the original
 * and its successor both exist. Counting both would double the exposure, so:
 *
 *   - a head (no row names it as parent) is counted, once, on its own value
 *     and end date; values are never added across versions
 *   - a superseded version is never in exposure. If its end date falls in the
 *     window it is only counted in alreadyRenewed (a successor covers it)
 *   - a parent still marked active that has a successor is a data
 *     inconsistency; it is excluded and counted in dataQuality
 *
 * Lapsed is derived from dates (end date before the as-of date), not from the
 * stored "expired" status, which is only written by the dashboard route.
 * This module never writes; it must not call syncExpiredAgreements().
 *
 * Deployment money here is contracted monthly billing (D6 applies). It is a
 * different measure from agreement contract value and the two are never added.
 *
 * Not selected: resource names, agreement notes and numbers, per-resource rates.
 */

type Bucket = RenewalsReport['agreements']['exposureByBucket'][number]['bucket'];
export const AGREEMENT_BUCKETS: readonly Bucket[] = ['0-30', '31-60', '61-90', '91+', 'lapsed'];

/** Bucket for days until expiry (negative = already past). */
export function agreementBucket(daysToExpiry: number): Bucket {
  if (daysToExpiry < 0) return 'lapsed';
  if (daysToExpiry <= 30) return '0-30';
  if (daysToExpiry <= 60) return '31-60';
  if (daysToExpiry <= 90) return '61-90';
  return '91+';
}

const DEPLOYMENT_BUCKETS = ['past_end_date', '0-30', '31-60', '61-90', '91+'] as const;
function deploymentBucket(days: number): (typeof DEPLOYMENT_BUCKETS)[number] {
  if (days < 0) return 'past_end_date';
  return agreementBucket(days) as '0-30' | '31-60' | '61-90' | '91+';
}

const hasSuccessor = sql`exists (select 1 from agreements successor where successor.parent_agreement_id = ${agreements.id})`;
const noSuccessor = sql`not exists (select 1 from agreements successor where successor.parent_agreement_id = ${agreements.id})`;

export const renewalsEndpoint: EndpointSpec<typeof renewalsParams, RenewalsReport> = {
  scope: 'renewals',
  schema: renewalsParams,
  async run(p, { db, asOf }) {
    const windowEnd = addDaysIso(asOf, p.window_days);
    const lapsedFrom = addDaysIso(asOf, -p.lapsed_within_days);
    const clientFilter = p.client_id ? eq(projects.clientId, p.client_id) : undefined;

    const agreementBase = () =>
      db
        .select({
          id: agreements.id,
          clientId: clients.id,
          clientName: clients.companyName,
          projectName: projects.projectName,
          title: agreements.title,
          currency: agreements.currency,
          value: agreements.value,
          endDate: agreements.endDate,
          renewalVersion: agreements.renewalVersion,
        })
        .from(agreements)
        .innerJoin(projects, eq(agreements.projectId, projects.id))
        .innerJoin(clients, eq(projects.clientId, clients.id));

    // Chain heads that are expiring in the window or lapsed recently.
    const heads = await agreementBase()
      .where(
        and(
          inArray(agreements.status, ['active', 'expired']),
          noSuccessor,
          sql`${agreements.endDate} >= ${lapsedFrom}`,
          lte(agreements.endDate, windowEnd),
          clientFilter,
        ),
      )
      .orderBy(agreements.endDate, agreements.id)
      .all();

    const countWhere = async (...conds: (SQL | undefined)[]) =>
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(agreements)
          .innerJoin(projects, eq(agreements.projectId, projects.id))
          .where(and(...conds, clientFilter))
          .get()
      )?.n ?? 0;

    const chainHeads = await countWhere(eq(agreements.status, 'active'), noSuccessor);
    const alreadyRenewed = await countWhere(hasSuccessor, sql`${agreements.endDate} >= ${asOf}`, lte(agreements.endDate, windowEnd));
    const supersededButActive = await countWhere(eq(agreements.status, 'active'), hasSuccessor);

    const items = heads.map((a) => {
      const daysToExpiry = daysBetweenIso(asOf, a.endDate);
      return {
        agreementId: a.id,
        clientId: a.clientId,
        clientName: a.clientName,
        projectName: a.projectName,
        title: a.title,
        currency: a.currency as Currency,
        value: round2(a.value),
        endDate: a.endDate,
        daysToExpiry,
        state: (daysToExpiry < 0 ? 'lapsed' : 'expiring') as 'lapsed' | 'expiring',
        renewalVersion: a.renewalVersion,
      };
    });

    const exposure = AGREEMENT_BUCKETS.map((bucket) => {
      const inBucket = items.filter((i) => agreementBucket(i.daysToExpiry) === bucket);
      const money = new Map<Currency, number>();
      for (const i of inBucket) if (isCurrency(i.currency)) addTo(money, i.currency, i.value);
      return { bucket, count: inBucket.length, contractValue: toMoney(money) };
    });

    // Deployments: still active, ending within the window, past their end
    // date, or open-ended.
    const deploymentRows = await db
      .select({
        endDate: deployments.endDate,
        currency: deployments.currency,
        n: sql<number>`count(*)`,
        billing: sql<number>`coalesce(sum(${deployments.billingAmount}), 0)`,
      })
      .from(deployments)
      .innerJoin(projects, eq(deployments.projectId, projects.id))
      .where(
        and(eq(deployments.status, 'active'), or(isNull(deployments.endDate), lte(deployments.endDate, windowEnd)), clientFilter),
      )
      .groupBy(deployments.endDate, deployments.currency)
      .all();

    let openEnded = 0;
    let endingInWindow = 0;
    const endingBilling = new Map<Currency, number>();
    const perBucket = new Map<string, { count: number; money: Map<Currency, number> }>();
    for (const r of deploymentRows) {
      if (r.endDate === null) {
        openEnded += r.n;
        continue;
      }
      const days = daysBetweenIso(asOf, r.endDate);
      const key = deploymentBucket(days);
      const b = perBucket.get(key) ?? { count: 0, money: new Map<Currency, number>() };
      b.count += r.n;
      if (isCurrency(r.currency)) addTo(b.money, r.currency, r.billing);
      perBucket.set(key, b);
      if (days >= 0) {
        endingInWindow += r.n;
        if (isCurrency(r.currency)) addTo(endingBilling, r.currency, r.billing);
      }
    }

    const { page, pagination } = paginate(items, p.limit, p.offset);
    return {
      data: {
        agreements: {
          chainHeads,
          expiring: items.filter((i) => i.state === 'expiring').length,
          lapsed: items.filter((i) => i.state === 'lapsed').length,
          alreadyRenewed,
          exposureByBucket: exposure,
          items: page,
          dataQuality: { supersededButActive },
        },
        deployments: {
          endingInWindow,
          openEnded,
          monthlyBillingEnding: toMoney(endingBilling),
          byBucket: DEPLOYMENT_BUCKETS.filter((b) => perBucket.has(b)).map((bucket) => ({
            bucket,
            count: perBucket.get(bucket)?.count ?? 0,
            monthlyBilling: toMoney(perBucket.get(bucket)?.money ?? new Map<Currency, number>()),
          })),
        },
      },
      notes: [
        'Exposure counts each agreement chain once, at its current version. A superseded version is never counted; if it ends in the window it appears only in alreadyRenewed.',
        'Contract value is the agreement value per currency, never converted and never added across versions. It is separate from deployment monthly billing and the two are not combined.',
        'lapsed means the end date is before the as-of date (Asia/Kolkata), judged from dates rather than the stored status. Lapsed agreements are shown back to lapsed_within_days.',
        'chainHeads is the number of live (active) agreements that have not been renewed. dataQuality.supersededButActive counts active agreements that already have a successor.',
        'Deployments cover active deployments. past_end_date are still active after their end date; openEnded have no end date. monthlyBillingEnding is contracted billing (not invoiced) of deployments ending within the window.',
        `Window: ${asOf} to ${windowEnd}.`,
      ],
      pagination,
      rowCount: page.length,
    };
  },
};

