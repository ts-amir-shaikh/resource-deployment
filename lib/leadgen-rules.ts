/**
 * Leadgen rules (M66) — pure, and safe to import from client components.
 *
 * The lists, the duplicate match, the conversion guard, the lead status moves,
 * the campaign result maths and the row-level access decisions all live here,
 * so the screens and the routes cannot each settle them differently. The
 * database-reading side (team lookups, scoping queries) is in
 * lib/leadgen-ownership.ts and calls into this file.
 */

/* ── Lists ─────────────────────────────────────────────────── */

/**
 * `converted` means the prospect became a lead (D4). Becoming a client is a
 * separate thing recorded in `converted_client_id` by "Onboard as client",
 * which can happen at any stage.
 */
export const PROSPECT_STAGES = ['new', 'contacted', 'meeting_set', 'qualified', 'converted', 'dead'] as const;
export type ProspectStage = (typeof PROSPECT_STAGES)[number];

export const PROSPECT_STAGE_LABELS: Record<ProspectStage, string> = {
  new: 'New',
  contacted: 'Contacted',
  meeting_set: 'Meeting set',
  qualified: 'Qualified',
  converted: 'Converted to lead',
  dead: 'Dead',
};

/** D12: temperature is its own field. It never moves the stage, nor the reverse. */
export const TEMPERATURES = ['cold', 'warm', 'hot'] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export const TEMPERATURE_LABELS: Record<Temperature, string> = {
  cold: 'Cold',
  warm: 'Warm',
  hot: 'Hot',
};

export const PROSPECT_SOURCES = ['inbound', 'referral', 'campaign', 'event', 'cold_outreach', 'other'] as const;
export type ProspectSource = (typeof PROSPECT_SOURCES)[number];

export const PROSPECT_SOURCE_LABELS: Record<ProspectSource, string> = {
  inbound: 'Inbound',
  referral: 'Referral',
  campaign: 'Campaign',
  event: 'Event',
  cold_outreach: 'Cold outreach',
  other: 'Other',
};

export const CAMPAIGN_CHANNELS = ['calls', 'email', 'linkedin', 'event', 'mixed'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  calls: 'Calls',
  email: 'Email',
  linkedin: 'LinkedIn',
  event: 'Event',
  mixed: 'Mixed',
};

export const CAMPAIGN_STATUSES = ['planned', 'active', 'closed'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  planned: 'Planned',
  active: 'Active',
  closed: 'Closed',
};

/** KTD2: a meeting is an activity, not a second concept. */
export const ACTIVITY_TYPES = ['call', 'email', 'linkedin', 'event', 'meeting', 'note'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call: 'Call',
  email: 'Email',
  linkedin: 'LinkedIn',
  event: 'Event',
  meeting: 'Meeting',
  note: 'Note',
};

export const ACTIVITY_OUTCOMES = [
  'no_answer',
  'not_interested',
  'interested',
  'follow_up',
  'meeting_booked',
  'other',
] as const;
export type ActivityOutcome = (typeof ACTIVITY_OUTCOMES)[number];

export const ACTIVITY_OUTCOME_LABELS: Record<ActivityOutcome, string> = {
  no_answer: 'No answer',
  not_interested: 'Not interested',
  interested: 'Interested',
  follow_up: 'Follow up',
  meeting_booked: 'Meeting booked',
  other: 'Other',
};

export const LEAD_STATUSES = ['open', 'handed_off', 'requirement_raised', 'closed_lost'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  open: 'Open',
  handed_off: 'With Sales',
  requirement_raised: 'Requirement raised',
  closed_lost: 'Closed — lost',
};

/** Q5: the qualification ticks shown at handoff. They gate nothing. */
export const BANT_KEYS = ['budget', 'authority', 'need', 'timeline'] as const;
export type BantKey = (typeof BANT_KEYS)[number];

export const BANT_LABELS: Record<BantKey, string> = {
  budget: 'Budget',
  authority: 'Authority',
  need: 'Need',
  timeline: 'Timeline',
};

export function bantScore(lead: Partial<Record<BantKey, boolean | null>>): number {
  return BANT_KEYS.filter((k) => Boolean(lead[k])).length;
}

/* ── Duplicate check (G-LED-06, Q6) ────────────────────────── */

/**
 * Legal-form words that say nothing about which company it is. Longest first,
 * so "private limited" is removed whole rather than leaving "private".
 */
const COMPANY_SUFFIXES = [
  'private limited',
  'pvt ltd',
  'pvt',
  'private',
  'limited',
  'ltd',
  'llp',
  'inc',
  'llc',
];

/**
 * The form two names are compared in: lower case, punctuation gone, legal
 * suffixes stripped from the end (repeatedly — "Acme Pvt. Ltd. LLC" is Acme).
 * Only trailing suffixes go: "Limited Brands" keeps its first word.
 */
export function normaliseCompanyName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  for (let changed = true; changed; ) {
    changed = false;
    for (const suffix of COMPANY_SUFFIXES) {
      if (s.endsWith(` ${suffix}`)) {
        s = s.slice(0, -suffix.length - 1).trim();
        changed = true;
      }
    }
  }
  return s;
}

export type CompanyRecord = { kind: 'prospect' | 'client'; id: number; name: string };

/**
 * Records whose name matches `name` once both are normalised. A warning, not
 * a block (Q6): two genuinely different firms can share a name, and the
 * person typing is the one who knows.
 */
export function findDuplicates(
  name: string,
  records: readonly CompanyRecord[],
  exclude?: { kind: CompanyRecord['kind']; id: number },
): CompanyRecord[] {
  const key = normaliseCompanyName(name);
  if (!key) return [];
  return records.filter(
    (r) => !(exclude && r.kind === exclude.kind && r.id === exclude.id) && normaliseCompanyName(r.name) === key,
  );
}

/* ── Prospect stage ────────────────────────────────────────── */

/** Stages a person may set by hand. `converted` is reached only by converting. */
export const SETTABLE_PROSPECT_STAGES = ['new', 'contacted', 'meeting_set', 'qualified', 'dead'] as const;

/** The board's columns, in funnel order. */
export const BOARD_STAGES: readonly ProspectStage[] = PROSPECT_STAGES;

/**
 * Why a stage change is refused, or null when it is fine. A converted
 * prospect is fixed: its lead carries the story on.
 */
export function stageChangeError(
  from: ProspectStage,
  to: ProspectStage,
  deadReason?: string | null,
): string | null {
  if (from === to) return null;
  if (from === 'converted') return 'This prospect has become a lead; its stage is fixed';
  if (to === 'converted') return 'Convert the prospect to a lead to move it to Converted';
  if (to === 'dead' && !deadReason?.trim()) return 'Give a reason for marking the prospect dead';
  return null;
}

/** Q3: only a qualified prospect becomes a lead, and only once. */
export function conversionError(stage: ProspectStage): string | null {
  if (stage === 'converted') return 'This prospect has already been converted to a lead';
  if (stage !== 'qualified') return 'Only a qualified prospect can be converted to a lead';
  return null;
}

/**
 * R4: logging a meeting on a prospect that has not got that far suggests
 * moving it to `meeting_set`. Suggested, not forced — the form offers it.
 */
export function stageAfterMeeting(stage: ProspectStage): ProspectStage | null {
  return stage === 'new' || stage === 'contacted' ? 'meeting_set' : null;
}

/* ── Lead status ───────────────────────────────────────────── */

/**
 * Status moves made by hand. `requirement_raised` is never chosen: it follows
 * from raising a requirement. A lost lead can be reopened, back to Leadgen.
 */
const LEAD_MOVES: Record<LeadStatus, readonly LeadStatus[]> = {
  open: ['handed_off', 'closed_lost'],
  handed_off: ['open', 'closed_lost'],
  requirement_raised: ['closed_lost'],
  closed_lost: ['open'],
};

/** The statuses a person may pick from here — for the edit form's choices. */
export function leadMovesFrom(status: LeadStatus): readonly LeadStatus[] {
  return LEAD_MOVES[status];
}

export function leadMoveError(from: LeadStatus, to: LeadStatus, closedReason?: string | null): string | null {
  if (from === to) return null;
  if (!LEAD_MOVES[from].includes(to)) {
    return `A lead cannot move from ${LEAD_STATUS_LABELS[from]} to ${LEAD_STATUS_LABELS[to]}`;
  }
  if (to === 'closed_lost' && !closedReason?.trim()) return 'Give a reason for closing the lead';
  return null;
}

/** A requirement is raised from a lead Sales holds — never from one still with Leadgen. */
export function canRaiseRequirement(status: LeadStatus): boolean {
  return status === 'handed_off' || status === 'requirement_raised';
}

/* ── Campaign results (G-LED-07, KTD3) ─────────────────────── */

export type CampaignActivity = {
  prospectId: number | null;
  type: string;
  outcome: string | null;
};

export type CampaignResults = {
  prospects: number;
  reached: number;
  responded: number;
  meetings: number;
  leads: number;
  /** Leads ÷ reached, as a percentage. Null when nobody was reached — not 0. */
  conversionPct: number | null;
};

/** Outcomes that mean the prospect did not engage. */
const NON_RESPONSES = new Set(['no_answer', 'not_interested']);

/**
 * Computed on read, never stored. `prospectIds` are the campaign's prospects;
 * `activities` and `leadProspectIds` may include rows from other prospects and
 * are filtered to these, so a caller can pass a wider query without skewing
 * the figures. `reached` counts prospects with at least one activity;
 * `responded` those with an outcome other than no answer / not interested;
 * `meetings` counts meeting activities.
 */
export function campaignResults(
  prospectIds: readonly number[],
  activities: readonly CampaignActivity[],
  leadProspectIds: readonly (number | null)[],
): CampaignResults {
  const inCampaign = new Set(prospectIds);
  const reached = new Set<number>();
  const responded = new Set<number>();
  let meetings = 0;
  for (const a of activities) {
    if (a.prospectId === null || !inCampaign.has(a.prospectId)) continue;
    reached.add(a.prospectId);
    if (a.outcome && !NON_RESPONSES.has(a.outcome)) responded.add(a.prospectId);
    if (a.type === 'meeting') meetings++;
  }
  const leads = new Set(leadProspectIds.filter((p): p is number => p !== null && inCampaign.has(p))).size;
  return {
    prospects: inCampaign.size,
    reached: reached.size,
    responded: responded.size,
    meetings,
    leads,
    conversionPct: reached.size === 0 ? null : Math.round((leads / reached.size) * 1000) / 10,
  };
}

/* ── Follow-ups ────────────────────────────────────────────── */

export type FollowUpActivity = {
  id: number;
  prospectId: number | null;
  leadId: number | null;
  activityDate: string;
  nextFollowUp: string | null;
};

/**
 * The follow-ups that are due by `today`: per lead (or, before there is one,
 * per prospect), only the latest activity counts — logging the follow-up call
 * is what clears the earlier promise. Ties on date fall to the later row.
 * A lead's activities also carry its prospect, so the lead is the key.
 */
export function dueFollowUps<T extends FollowUpActivity>(activities: readonly T[], today: string): T[] {
  const latest = new Map<string, T>();
  for (const a of activities) {
    const key = a.leadId !== null ? `l${a.leadId}` : a.prospectId !== null ? `p${a.prospectId}` : null;
    if (!key) continue;
    const seen = latest.get(key);
    if (!seen || a.activityDate > seen.activityDate || (a.activityDate === seen.activityDate && a.id > seen.id)) {
      latest.set(key, a);
    }
  }
  return [...latest.values()]
    .filter((a) => a.nextFollowUp !== null && a.nextFollowUp <= today)
    .sort((a, b) => (a.nextFollowUp! < b.nextFollowUp! ? -1 : 1));
}

/* ── Row-level access (Q4) ─────────────────────────────────── */

/**
 * Who is asking. A structural subset of the session's Viewer, so this file
 * stays free of server imports.
 */
export type LeadgenViewer = { role: string; uid: number; isTeamLead: boolean };

export type Access = { read: boolean; edit: boolean };

const NONE: Access = { read: false, edit: false };

/**
 * Owned by me, or — for a head — owned by my team or by nobody, which is what
 * a head assigns from. The same rule lib/ownership.ts applies to requirements.
 */
function ownsOrHeads(v: LeadgenViewer, ownerId: number | null, team: readonly number[]): boolean {
  if (ownerId !== null && ownerId === v.uid) return true;
  return v.isTeamLead && (ownerId === null || team.includes(ownerId));
}

/**
 * Prospects (and their contacts and activities). Leadgen: own, or the team's
 * plus unowned for a head. Sales: all, read-only. Management: read. TA and
 * the rest: nothing — middleware already refuses them; this is the backstop.
 */
export function prospectAccess(v: LeadgenViewer, ownerUserId: number | null, leadgenTeam: readonly number[]): Access {
  if (v.role === 'admin') return { read: true, edit: true };
  if (v.role === 'management' || v.role === 'sales') return { read: true, edit: false };
  if (v.role === 'leadgen') {
    const mine = ownsOrHeads(v, ownerUserId, leadgenTeam);
    return { read: mine, edit: mine };
  }
  return NONE;
}

/** Campaigns are read by every front-of-funnel role; edited by the owner, a Leadgen head, or Admin. */
export function campaignAccess(v: LeadgenViewer, ownerUserId: number | null, leadgenTeam: readonly number[]): Access {
  if (v.role === 'admin') return { read: true, edit: true };
  if (v.role === 'management' || v.role === 'sales') return { read: true, edit: false };
  if (v.role === 'leadgen') return { read: true, edit: ownsOrHeads(v, ownerUserId, leadgenTeam) };
  return NONE;
}

export type LeadRow = {
  status: LeadStatus;
  leadOwnerUserId: number | null;
  salesOwnerUserId: number | null;
  /** Set while Sales holds the lead; cleared if it is sent back to Leadgen. */
  handedOffAt: string | null;
};

export type LeadAccess = Access & {
  /** May log activities on it. Leadgen keeps this after handoff — they still know the account. */
  log: boolean;
};

/**
 * Leads. Leadgen: their own (or the team's, for a head), editable until it is
 * handed off. Sales: once handed off — a member sees the unassigned
 * queue and their own, and edits their own; a head sees and edits all of the
 * team's and the queue. Admin everything; Management reads.
 */
export function leadAccess(
  v: LeadgenViewer,
  lead: LeadRow,
  teams: { leadgen: readonly number[]; sales: readonly number[] },
): LeadAccess {
  if (v.role === 'admin') return { read: true, edit: true, log: true };
  if (v.role === 'management') return { read: true, edit: false, log: false };
  if (v.role === 'leadgen') {
    const mine = ownsOrHeads(v, lead.leadOwnerUserId, teams.leadgen);
    return { read: mine, edit: mine && !lead.handedOffAt, log: mine };
  }
  if (v.role === 'sales') {
    if (!lead.handedOffAt) return { read: false, edit: false, log: false };
    const mine = ownsOrHeads(v, lead.salesOwnerUserId, teams.sales);
    const queue = lead.salesOwnerUserId === null;
    return { read: mine || queue, edit: mine, log: mine };
  }
  return { read: false, edit: false, log: false };
}
