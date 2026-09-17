import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from './db';
import { opportunities, opportunityAssignees, users } from './schema';
import type { Viewer } from './session';
import type { Role } from './auth';

/**
 * Row-level decisions the access table cannot make.
 *
 * Middleware answers "may this role reach this path". It cannot answer "is
 * this leadgen's own requirement" or "is this stage one they may move to" —
 * both need the row. This module is the one place that does, called by the
 * route handlers *and* the pages, so the UI never offers a button the request
 * would then reject. Same principle as lib/access.ts, one level down.
 */

export type OwnedRow = {
  id: number;
  stage: string;
  leadOwnerUserId: number | null;
  salesOwnerUserId: number | null;
};

/** Stages a lead may be moved through before it is handed to sales. */
export const LEADGEN_STAGES = ['requirement', 'qualification', 'budgeting'] as const;
/** Where sales takes over. */
export const SALES_STAGES = ['budgeting', 'candidate_mapping', 'interview', 'agreement'] as const;

/** Ids of every active account with this role — the "team" a head oversees. */
export async function teamIds(role: Role): Promise<number[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, role), eq(users.active, true)))
    .all();
  return rows.map((r) => r.id);
}

export async function assigneeIds(opportunityId: number): Promise<number[]> {
  const rows = await db
    .select({ userId: opportunityAssignees.userId })
    .from(opportunityAssignees)
    .where(eq(opportunityAssignees.opportunityId, opportunityId))
    .all();
  return rows.map((r) => r.userId);
}

/**
 * The requirement ids this viewer's board is about. `null` means "no filter"
 * — Admin, Management and Sales see the pipeline whole; a head sees their
 * team's; a member sees their own.
 */
export async function visibleOpportunityIds(v: Viewer): Promise<number[] | null> {
  if (v.role === 'admin' || v.role === 'management' || v.role === 'sales') return null;

  if (v.role === 'leadgen') {
    const owners = v.isTeamLead ? await teamIds('leadgen') : [v.uid];
    const rows = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(inArray(opportunities.leadOwnerUserId, owners))
      .all();
    // A head also sees what nobody owns yet — that is what assigning is for.
    if (v.isTeamLead) {
      const unowned = await db
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(isNull(opportunities.leadOwnerUserId))
        .all();
      return [...rows.map((r) => r.id), ...unowned.map((r) => r.id)];
    }
    return rows.map((r) => r.id);
  }

  // TA: the pipeline is visible whole (it always was); the *board* on /my is
  // scoped by assignment, and that lives in getRecruiterBoard.
  return null;
}

/** May this viewer edit the requirement's fields? */
export async function canEditRequirement(v: Viewer, row: OwnedRow): Promise<boolean> {
  if (v.role === 'admin') return true;
  if (v.role === 'leadgen') {
    if (!(LEADGEN_STAGES as readonly string[]).includes(row.stage) && row.stage !== 'hold') return false;
    if (row.leadOwnerUserId === v.uid) return true;
    if (v.isTeamLead) {
      const team = await teamIds('leadgen');
      return row.leadOwnerUserId === null || team.includes(row.leadOwnerUserId);
    }
    return false;
  }
  if (v.role === 'sales') {
    if (row.salesOwnerUserId === v.uid) return true;
    if (v.isTeamLead) {
      const team = await teamIds('sales');
      return row.salesOwnerUserId === null || team.includes(row.salesOwnerUserId);
    }
    return false;
  }
  return false;
}

/**
 * Which stages this viewer may move the requirement to.
 *
 * Leadgen: within the early stages, or to lost/hold, and only before the
 * handover — once a requirement is past budgeting it is no longer theirs to
 * move. Sales: from budgeting to closure. TA and Admin: unchanged from today.
 */
export async function allowedStages(v: Viewer, row: OwnedRow): Promise<readonly string[] | 'all'> {
  if (v.role === 'admin' || v.role === 'ta') return 'all';
  if (v.role === 'management') return [];
  if (!(await canEditRequirement(v, row))) return [];
  if (v.role === 'leadgen') return [...LEADGEN_STAGES, 'lost', 'hold'];
  return [...SALES_STAGES, 'won', 'lost', 'hold'];
}

/**
 * May this viewer set this kind of owner on this requirement? Admin sets any;
 * a head sets their own kind within their team; nobody else — a member cannot
 * reassign their own lead away.
 */
export async function canSetOwner(
  v: Viewer,
  kind: 'lead' | 'sales' | 'ta',
  targetUserId: number | null,
): Promise<boolean> {
  if (v.role === 'admin') return true;
  if (!v.isTeamLead) return false;
  const roleFor: Record<typeof kind, Role> = { lead: 'leadgen', sales: 'sales', ta: 'ta' };
  if (v.role !== roleFor[kind]) return false;
  if (targetUserId === null) return true;
  return (await teamIds(v.role)).includes(targetUserId);
}
