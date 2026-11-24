import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { clients, opportunities, opportunityCandidates, opportunityStageHistory } from '@/lib/schema';
import { pipelineParams } from './params';
import { addDaysIso } from './dates';
import { paginate } from './paginate';
import type { EndpointSpec } from './handler';
import type { CandidateStatus, OpportunityStage, PipelineReport } from './types';

/**
 * GET /api/reporting/v1/pipeline — requirements by stage, positions, mapping
 * and fulfilment, as counts. No candidate, no person, no budget.
 *
 * Three measures that must never be mixed up (see the notes in the response):
 *   mappedCandidates          every mapping, any status, per stage. Mappings,
 *                             not people: one candidate on two requirements counts twice.
 *   mappingsInFilledStatus    UNCAPPED. Mappings in selected/offered/joined on
 *                             open requirements. This is the figure the
 *                             dashboard (getPipelineSummary) labels
 *                             "filledPositions".
 *   filledPositions           CAPPED. Per open requirement,
 *                             min(mappings in a filled status, required positions),
 *                             summed. Never exceeds openPositions.
 *
 * Specification and test oracle: getPipelineSummary() in lib/queries.ts, held
 * to this by tests/reporting-parity.test.ts (reporting owns its queries because
 * that module uses the global, writable client).
 *
 * Not selected: candidate names, ids, CTC, resumes, JD text, owners, comments,
 * share tokens, budget, deal value, hiring budget.
 */

export const OPEN_STAGES: readonly OpportunityStage[] = [
  'requirement',
  'qualification',
  'budgeting',
  'candidate_mapping',
  'interview',
  'agreement',
];
export const ALL_STAGES: readonly OpportunityStage[] = [...OPEN_STAGES, 'won', 'lost', 'hold'];

/** Mapping statuses that count as a position being filled. Parity-tested against lib/queries.ts. */
export const FILLED_STATUSES = ['selected', 'offered', 'joined'] as const;

export const CANDIDATE_STATUS_ORDER: readonly CandidateStatus[] = [
  'mapped',
  'screening',
  'submitted',
  'interview',
  'selected',
  'offered',
  'joined',
  'rejected',
  'withdrawn',
];

export type RequirementRow = { id: number; required: number; clientId: number | null; filled: number };

/** Pure: per-requirement rows in, capped and uncapped fills out. Exported for unit tests. */
export function foldOpen(rows: RequirementRow[]) {
  let positions = 0;
  let filledPositions = 0;
  let mappingsInFilledStatus = 0;
  for (const r of rows) {
    positions += r.required;
    mappingsInFilledStatus += r.filled;
    filledPositions += Math.min(r.filled, r.required);
  }
  return {
    requirements: rows.length,
    positions,
    filledPositions,
    unfilledPositions: positions - filledPositions,
    fulfilmentPct: positions > 0 ? Math.round((filledPositions / positions) * 1000) / 10 : null,
    mappingsInFilledStatus,
  };
}

export const pipelineEndpoint: EndpointSpec<typeof pipelineParams, PipelineReport> = {
  scope: 'pipeline',
  schema: pipelineParams,
  async run(p, { db, asOf }) {
    const clientFilter = p.client_id ? eq(opportunities.clientId, p.client_id) : undefined;

    // Which stages the byStage list covers.
    let listed: readonly OpportunityStage[];
    if (p.stage === 'open') listed = OPEN_STAGES;
    else if (p.stage) listed = [p.stage as OpportunityStage];
    else listed = p.include_terminal ? ALL_STAGES : OPEN_STAGES;

    const stageRows = await db
      .select({
        stage: opportunities.stage,
        n: sql<number>`count(*)`,
        positions: sql<number>`coalesce(sum(${opportunities.requiredCount}), 0)`,
      })
      .from(opportunities)
      .where(and(inArray(opportunities.stage, [...listed]), clientFilter))
      .groupBy(opportunities.stage)
      .all();

    const mappingRows = await db
      .select({
        stage: opportunities.stage,
        status: opportunityCandidates.status,
        n: sql<number>`count(*)`,
      })
      .from(opportunityCandidates)
      .innerJoin(opportunities, eq(opportunityCandidates.opportunityId, opportunities.id))
      .where(and(inArray(opportunities.stage, [...listed]), clientFilter))
      .groupBy(opportunities.stage, opportunityCandidates.status)
      .all();

    const byStage = ALL_STAGES.filter((s) => listed.includes(s)).map((stage) => {
      const s = stageRows.find((r) => r.stage === stage);
      const mapped = Object.fromEntries(CANDIDATE_STATUS_ORDER.map((st) => [st, 0])) as Record<CandidateStatus, number>;
      for (const m of mappingRows) {
        if (m.stage === stage && m.status in mapped) mapped[m.status as CandidateStatus] = m.n;
      }
      return { stage, requirements: s?.n ?? 0, positions: s?.positions ?? 0, mappedCandidates: mapped };
    });

    // Open requirements, one row each, with how many mappings are in a filled status.
    const stageFilter = p.stage && p.stage !== 'open' ? eq(opportunities.stage, p.stage as OpportunityStage) : undefined;
    const openWhere = and(inArray(opportunities.stage, [...OPEN_STAGES]), clientFilter, stageFilter);
    const filledList = sql.join(
      FILLED_STATUSES.map((s) => sql`${s}`),
      sql`, `,
    );
    const requirementRows = await db
      .select({
        id: opportunities.id,
        required: opportunities.requiredCount,
        clientId: opportunities.clientId,
        filled: sql<number>`coalesce(sum(case when ${opportunityCandidates.status} in (${filledList}) then 1 else 0 end), 0)`,
      })
      .from(opportunities)
      .leftJoin(opportunityCandidates, eq(opportunityCandidates.opportunityId, opportunities.id))
      .where(openWhere)
      .groupBy(opportunities.id)
      .all();

    const open = foldOpen(requirementRows);

    // Won and lost in the last 90 days, from the stage history (every move is
    // logged with a timestamp), counting each opportunity once.
    const cutoff = addDaysIso(asOf, -90);
    const closedRows = await db
      .select({
        toStage: opportunityStageHistory.toStage,
        n: sql<number>`count(distinct ${opportunityStageHistory.opportunityId})`,
      })
      .from(opportunityStageHistory)
      .innerJoin(opportunities, eq(opportunityStageHistory.opportunityId, opportunities.id))
      .where(
        and(
          inArray(opportunityStageHistory.toStage, ['won', 'lost']),
          sql`${opportunityStageHistory.createdAt} >= ${cutoff}`,
          clientFilter,
        ),
      )
      .groupBy(opportunityStageHistory.toStage)
      .all();

    const onHold =
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(opportunities)
          .where(and(eq(opportunities.stage, 'hold'), clientFilter))
          .get()
      )?.n ?? 0;

    const followUpsDue =
      (
        await db
          .select({ n: sql<number>`count(*)` })
          .from(opportunities)
          .where(and(openWhere, isNotNull(opportunities.nextStepDate), lte(opportunities.nextStepDate, asOf)))
          .get()
      )?.n ?? 0;

    // Open requirements per client. A requirement with no client yet (a
    // prospect) has no client to name and is left out of this list only.
    const perClient = new Map<number, RequirementRow[]>();
    for (const r of requirementRows) {
      if (r.clientId === null) continue;
      const list = perClient.get(r.clientId) ?? [];
      list.push(r);
      perClient.set(r.clientId, list);
    }
    const ids = [...perClient.keys()];
    const names = ids.length
      ? await db.select({ id: clients.id, name: clients.companyName }).from(clients).where(inArray(clients.id, ids)).all()
      : [];
    const clientRows = ids
      .map((clientId) => {
        const f = foldOpen(perClient.get(clientId) ?? []);
        return {
          clientId,
          clientName: names.find((n) => n.id === clientId)?.name ?? '',
          openRequirements: f.requirements,
          openPositions: f.positions,
          filledPositions: f.filledPositions,
        };
      })
      .sort((a, b) => a.clientName.localeCompare(b.clientName) || a.clientId - b.clientId);
    const { page, pagination } = paginate(clientRows, p.limit, p.offset);

    return {
      data: {
        byStage,
        open: {
          requirements: open.requirements,
          positions: open.positions,
          filledPositions: open.filledPositions,
          unfilledPositions: open.unfilledPositions,
          fulfilmentPct: open.fulfilmentPct,
          mappingsInFilledStatus: open.mappingsInFilledStatus,
        },
        closedLast90d: {
          won: closedRows.find((r) => r.toStage === 'won')?.n ?? 0,
          lost: closedRows.find((r) => r.toStage === 'lost')?.n ?? 0,
        },
        onHold,
        followUpsDue,
        byClient: page,
      },
      notes: [
        'open covers the six active stages (requirement to agreement). positions is the sum of required positions.',
        'filledPositions is capped: for each open requirement it counts at most the required number of mappings in selected, offered or joined. It never exceeds positions.',
        'mappingsInFilledStatus is uncapped: every mapping in selected, offered or joined on open requirements. It can exceed positions when a requirement is over-filled, and it is the figure the dashboard calls filledPositions.',
        'mappedCandidates counts mappings, not people: someone mapped to two requirements counts twice. All nine statuses are shown, including rejected and withdrawn.',
        'closedLast90d counts opportunities moved to won or lost in the 90 days to the as-of date. byClient lists open requirements that have a client; requirements still at prospect stage are in the totals only.',
        'No candidate identity, budget or deal value is included.',
      ],
      pagination,
      rowCount: byStage.length + page.length,
    };
  },
};

