import 'server-only';
import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { leads, prospects } from './schema';
import { teamIds } from './ownership';
import {
  campaignAccess,
  leadAccess,
  prospectAccess,
  type Access,
  type LeadAccess,
  type LeadRow,
} from './leadgen-rules';
import type { Viewer } from './session';

/**
 * Row-level rules for M66, beside lib/ownership.ts and in the same spirit:
 * middleware opens the door to /prospects and /api/leadgen; this decides
 * which rows behind it. The decisions themselves are pure, in
 * lib/leadgen-rules.ts — this file only supplies the team lists and turns the
 * same rules into WHERE clauses for the list queries, so a list never shows
 * a row its detail page would refuse.
 */

export type Teams = { leadgen: number[]; sales: number[] };

/** Only the teams the viewer's role needs; heads are the only ones who use them. */
export async function teamsFor(v: Viewer): Promise<Teams> {
  return {
    leadgen: v.role === 'leadgen' && v.isTeamLead ? await teamIds('leadgen') : [],
    sales: v.role === 'sales' && v.isTeamLead ? await teamIds('sales') : [],
  };
}

export async function prospectAccessFor(v: Viewer, ownerUserId: number | null): Promise<Access> {
  return prospectAccess(v, ownerUserId, (await teamsFor(v)).leadgen);
}

export async function campaignAccessFor(v: Viewer, ownerUserId: number | null): Promise<Access> {
  return campaignAccess(v, ownerUserId, (await teamsFor(v)).leadgen);
}

export async function leadAccessFor(v: Viewer, lead: LeadRow): Promise<LeadAccess> {
  return leadAccess(v, lead, await teamsFor(v));
}

/** Matches nothing — for a role that reaches the route but owns no rows. */
const NOTHING = sql`0 = 1`;

/** Owned by me; for a head, owned by the team or by nobody. */
function ownedBy(column: typeof prospects.ownerUserId | typeof leads.leadOwnerUserId | typeof leads.salesOwnerUserId, v: Viewer, team: number[]): SQL {
  if (!v.isTeamLead) return eq(column, v.uid);
  return team.length ? or(inArray(column, team), isNull(column))! : isNull(column);
}

/**
 * WHERE clause for the prospects this viewer may see. Undefined means every
 * prospect (Admin, Management, Sales — Q4).
 */
export async function prospectScope(v: Viewer): Promise<SQL | undefined> {
  if (v.role === 'admin' || v.role === 'management' || v.role === 'sales') return undefined;
  if (v.role === 'leadgen') return ownedBy(prospects.ownerUserId, v, (await teamsFor(v)).leadgen);
  return NOTHING;
}

/** WHERE clause for the leads this viewer may see; the list form of leadAccess(). */
export async function leadScope(v: Viewer): Promise<SQL | undefined> {
  if (v.role === 'admin' || v.role === 'management') return undefined;
  const teams = await teamsFor(v);
  if (v.role === 'leadgen') return ownedBy(leads.leadOwnerUserId, v, teams.leadgen);
  if (v.role === 'sales') {
    // The unassigned queue is visible to every salesperson; owned leads to
    // their owner, or to a head for the team's.
    return and(isNotNull(leads.handedOffAt), or(isNull(leads.salesOwnerUserId), ownedBy(leads.salesOwnerUserId, v, teams.sales)));
  }
  return NOTHING;
}
