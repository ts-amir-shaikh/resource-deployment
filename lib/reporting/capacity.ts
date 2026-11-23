import { and, eq, isNull, sql } from 'drizzle-orm';
import { deployments, resources } from '@/lib/schema';
import { capacityParams } from './params';
import { paginate } from './paginate';
import { round2 } from './money';
import type { EndpointSpec } from './handler';
import type { CapacityReport } from './types';

/**
 * GET /api/reporting/v1/capacity — allocation-based utilisation and bench.
 *
 * Population: resources with no exit date (same rule as getResourceUtilisation
 * in lib/queries.ts, which tests/reporting-parity.test.ts reconciles against).
 * Allocation: the sum of allocation_percentage over each resource's ACTIVE
 * deployments, billable and shadow kept apart. Bench is derived from that and
 * nothing else; there is no bench entity, bench-since date or cost.
 *
 * Aggregates only (D4): the query selects a resource's id and primary skill
 * and nothing that identifies or prices a person (no name, designation,
 * contact, CTC or exit detail).
 */

export type ResourceAllocation = { id: number; skill: string | null; billable: number; shadow: number };

export type CapacityComputation = Omit<CapacityReport, 'bySkill'> & { bySkillAll: CapacityReport['bySkill'] };

const round1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;

/** Pure: allocation rows in, report out. Exported for unit tests. */
export function computeCapacity(rows: ResourceAllocation[], minFree: number): CapacityComputation {
  let sumBillable = 0;
  let sumShadow = 0;
  let sumFree = 0;
  let fullyBench = 0;
  let partiallyAvailable = 0;
  let fullyAllocated = 0;
  let shadowOnly = 0;
  let availablePct = 0;
  const skills = new Map<string | null, { headcount: number; availablePct: number; fullyBench: number }>();

  for (const r of rows) {
    // Allocation is capped at 100% on write, but clamp so bad data cannot
    // push free capacity negative or utilisation above 100%.
    const b = Math.min(100, Math.max(0, r.billable));
    const s = Math.min(100 - b, Math.max(0, r.shadow));
    const free = 100 - b - s;

    sumBillable += b;
    sumShadow += s;
    sumFree += free;

    if (free === 100) fullyBench++;
    else if (free === 0) fullyAllocated++;
    else partiallyAvailable++;
    if (b === 0 && s > 0) shadowOnly++;
    if (free >= minFree) availablePct += free;

    const skill = r.skill && r.skill.trim() !== '' ? r.skill.trim() : null;
    const entry = skills.get(skill) ?? { headcount: 0, availablePct: 0, fullyBench: 0 };
    entry.headcount++;
    if (free >= minFree) entry.availablePct += free;
    if (free === 100) entry.fullyBench++;
    skills.set(skill, entry);
  }

  const n = rows.length;
  const billablePct = n === 0 ? 0 : round1(sumBillable / n);
  const bySkillAll = [...skills.entries()]
    .map(([primarySkill, v]) => ({
      primarySkill,
      headcount: v.headcount,
      availableFte: round2(v.availablePct / 100),
      fullyBench: v.fullyBench,
    }))
    .sort((a, b) => b.headcount - a.headcount || (a.primarySkill ?? '￿').localeCompare(b.primarySkill ?? '￿'));

  return {
    headcount: n,
    allocation: {
      billablePct,
      shadowPct: n === 0 ? 0 : round1(sumShadow / n),
      freePct: n === 0 ? 0 : round1(sumFree / n),
    },
    // Σ billable% / (100 × headcount), as a percentage: the billable share of
    // the whole team's capacity.
    utilisationPct: billablePct,
    bench: { fullyBench, partiallyAvailable, fullyAllocated, shadowOnly, availableFte: round2(availablePct / 100) },
    bySkillAll,
  };
}

export const capacityEndpoint: EndpointSpec<typeof capacityParams, CapacityReport> = {
  scope: 'capacity',
  schema: capacityParams,
  async run(p, { db }) {
    const rows = await db
      .select({
        id: resources.id,
        skill: resources.primarySkill,
        billable: sql<number>`coalesce(sum(case when ${deployments.deploymentType} = 'billable' then ${deployments.allocationPercentage} else 0 end), 0)`,
        shadow: sql<number>`coalesce(sum(case when ${deployments.deploymentType} = 'shadow' then ${deployments.allocationPercentage} else 0 end), 0)`,
      })
      .from(resources)
      .leftJoin(deployments, and(eq(deployments.resourceId, resources.id), eq(deployments.status, 'active')))
      .where(isNull(resources.exitDate))
      .groupBy(resources.id)
      .all();

    const { bySkillAll, ...rest } = computeCapacity(rows, p.min_free);
    const { page, pagination } = paginate(bySkillAll, p.limit, p.offset);
    return {
      data: { ...rest, bySkill: page },
      notes: [
        'Allocation-based: derived from active deployment allocation percentages. Billable and shadow deployments both use capacity; shadow does not bill.',
        'Resources who have an exit date recorded are excluded, matching the dashboard utilisation board.',
        'fullyBench = nothing allocated; partiallyAvailable = some but not all; fullyAllocated = nothing free; shadowOnly = only shadow allocation (also counted in the other groups).',
        'min_free sets the smallest free share that counts as available; it affects availableFte only, not the group counts.',
        'No salary, cost or individual detail is included. utilisationPct is the billable share of total capacity.',
      ],
      pagination,
      rowCount: page.length,
    };
  },
};
