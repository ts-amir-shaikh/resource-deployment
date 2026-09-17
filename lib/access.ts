import type { Role } from './auth';

/**
 * The single source of truth for who can see and change what.
 *
 * Deliberately one table rather than a check inside each of the ~35 API route
 * handlers: a permission spread across that many files is one forgotten import
 * away from a hole, and there is no way to read the policy as a whole. Here,
 * middleware enforces it before any route code runs, and the navigation reads
 * the same table so the UI can never offer a link the request would reject.
 *
 * Edge-safe: no database, no node:* imports. Middleware runs on the Edge.
 */

export type NavItem = {
  href: string;
  label: string;
  roles: readonly Role[];
};

const ALL: readonly Role[] = ['admin', 'management', 'ta', 'leadgen', 'sales'];
const TA_ONLY: readonly Role[] = ['ta'];
const BACK_OFFICE: readonly Role[] = ['admin', 'management'];
/** The fulfilment side — everyone except the two front-of-funnel roles. */
const FULFILMENT: readonly Role[] = ['admin', 'management', 'ta', 'sales'];

export const NAV: NavItem[] = [
  { href: '/', label: 'Dashboard', roles: BACK_OFFICE },
  { href: '/my', label: 'My Work', roles: TA_ONLY },
  { href: '/leads', label: 'My Leads', roles: ['leadgen'] },
  { href: '/sales', label: 'My Deals', roles: ['sales'] },
  { href: '/pipeline', label: 'Pipeline', roles: ALL },
  { href: '/candidates', label: 'Candidates', roles: FULFILMENT },
  { href: '/agents', label: 'Agents', roles: FULFILMENT },
  { href: '/resources', label: 'Resources', roles: BACK_OFFICE },
  { href: '/clients', label: 'Clients', roles: BACK_OFFICE },
  { href: '/projects', label: 'Projects', roles: BACK_OFFICE },
  { href: '/deployments', label: 'Deployments', roles: BACK_OFFICE },
  { href: '/agreements', label: 'Agreements & POs', roles: BACK_OFFICE },
  { href: '/invoices', label: 'Invoices', roles: BACK_OFFICE },
];

export function navFor(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

/** Where a role lands after login — each team role starts on its own board. */
export function landingPath(role: Role): string {
  switch (role) {
    case 'ta':
      return '/my';
    case 'leadgen':
      return '/leads';
    case 'sales':
      return '/sales';
    default:
      return '/';
  }
}

/**
 * Read surface for TA. Pipeline and Candidates are the job; the client,
 * resource and pipeline-summary endpoints are here because the pipeline and
 * candidate screens read from them (client dropdown, linking a candidate to an
 * existing bench resource). Everything commercial is absent by omission.
 */
const TA_READ_PREFIXES = [
  '/my',
  '/pipeline',
  '/candidates',
  '/agents',
  '/api/agents',
  '/api/opportunities',
  '/api/candidates',
  '/api/clients',
  '/api/resources',
  '/api/referrals',
  '/api/rating-criteria',
  '/api/ratings',
  '/api/applications',
  '/api/interviews',
  '/api/dashboard/pipeline',
];

/**
 * Leadgen: the pipeline and nothing else. No candidates, no agents, no
 * resources. Which requirements within the pipeline they may see and touch is
 * decided per row in lib/ownership.ts — middleware only opens the door.
 */
const LEADGEN_READ_PREFIXES = [
  '/leads',
  '/pipeline',
  '/api/opportunities',
  '/api/prospects',
  '/api/clients',
  '/api/users/team',
];

/**
 * Sales: the pipeline with its commercial figures, the candidates put forward
 * on their deals, and the agents that support closing. Not resources,
 * deployments or invoicing — closing a deal and running it are different jobs.
 */
const SALES_READ_PREFIXES = [
  '/sales',
  '/pipeline',
  '/candidates',
  '/agents',
  '/api/agents',
  '/api/opportunities',
  '/api/prospects',
  '/api/candidates',
  '/api/clients',
  '/api/referrals',
  '/api/rating-criteria',
  '/api/ratings',
  '/api/interviews',
  '/api/applications',
  '/api/users/team',
  '/api/dashboard/pipeline',
];

/** Paths every signed-in role may reach regardless of role. */
const COMMON_PREFIXES = ['/api/auth/'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`));
}

/** Can this role reach this path at all? Applies to pages and API alike. */
export function canAccess(role: Role, pathname: string): boolean {
  if (matchesPrefix(pathname, COMMON_PREFIXES)) return true;
  if (role === 'admin' || role === 'management') return true;
  if (role === 'leadgen') return matchesPrefix(pathname, LEADGEN_READ_PREFIXES);
  if (role === 'sales') return matchesPrefix(pathname, SALES_READ_PREFIXES);
  return matchesPrefix(pathname, TA_READ_PREFIXES);
}

/**
 * Write surface for TA: progressing candidates through the pipeline. Creating
 * an opportunity, editing the requirement, and converting a won deal into a
 * project are all deliberately excluded — TA fulfils requirements, it does not
 * originate or close them.
 *
 * Order matters. The first matching rule wins, so the narrow denials for
 * /convert and the bare /api/opportunities collection sit above the broader
 * allowance for everything nested under an opportunity.
 */
type WriteRule = { test: (p: string) => boolean; allow: boolean };

const TA_WRITE_RULES: WriteRule[] = [
  // Converting a won opportunity into a project + deployments is commercial.
  { test: (p) => /^\/api\/opportunities\/\d+\/convert$/.test(p), allow: false },
  // So is onboarding a prospect as a client. Note the rule above ends in $ and
  // does NOT cover this path — without its own denial it fell through to the
  // broad "anything nested under an opportunity" allowance below and TA could
  // create client records.
  { test: (p) => /^\/api\/opportunities\/\d+\/convert-client$/.test(p), allow: false },
  // Creating an opportunity, or editing the requirement itself (M12: admin).
  { test: (p) => p === '/api/opportunities', allow: false },
  { test: (p) => /^\/api\/opportunities\/\d+$/.test(p), allow: false },
  // Mapping candidates, logging interview feedback, commenting, moving stage,
  // and accepting a referral into the pool.
  { test: (p) => /^\/api\/opportunities\/\d+\//.test(p), allow: true },
  { test: (p) => p.startsWith('/api/candidates'), allow: true },
  { test: (p) => p.startsWith('/api/referrals'), allow: true },
  // Rating candidates and defining new pointers is core TA work.
  { test: (p) => p.startsWith('/api/rating-criteria'), allow: true },
  { test: (p) => p.startsWith('/api/ratings'), allow: true },
  // Logging interview rounds and panel feedback, and marking the applicant
  // queue as seen. Reviewing inbound profiles is the job these accounts exist
  // to do, so both the call log and the round history are theirs to write.
  { test: (p) => p.startsWith('/api/interviews'), allow: true },
  { test: (p) => p.startsWith('/api/applications'), allow: true },
  // Running agents is TA's daily work — JD analysis, resume vetting, formatting.
  { test: (p) => p.startsWith('/api/agents'), allow: true },
];

/**
 * Leadgen writes: create a requirement, edit one, move its stage, comment,
 * add a prospect. Whether it is *their* requirement, and whether the stage is
 * one they may reach, is the row-level check in lib/ownership.ts. Never the
 * fulfilment routes, never conversion, never owners (a head sets the lead
 * owner through /owners — allowed here, scoped there).
 */
const LEADGEN_WRITE_RULES: WriteRule[] = [
  { test: (p) => /^\/api\/opportunities\/\d+\/convert(-client)?$/.test(p), allow: false },
  { test: (p) => /^\/api\/opportunities\/\d+\/(candidates|listing)/.test(p), allow: false },
  { test: (p) => p === '/api/opportunities', allow: true },
  { test: (p) => /^\/api\/opportunities\/\d+$/.test(p), allow: true },
  { test: (p) => /^\/api\/opportunities\/\d+\/(stage|comments|owners)$/.test(p), allow: true },
  { test: (p) => p.startsWith('/api/prospects'), allow: true },
];

/**
 * Sales writes: everything on a requirement from budgeting to closure, plus
 * onboarding a prospect as a client. Not project conversion — that is Admin.
 */
const SALES_WRITE_RULES: WriteRule[] = [
  { test: (p) => /^\/api\/opportunities\/\d+\/convert$/.test(p), allow: false },
  { test: (p) => p.startsWith('/api/opportunities'), allow: true },
  { test: (p) => p.startsWith('/api/prospects'), allow: true },
  { test: (p) => p.startsWith('/api/candidates'), allow: true },
  { test: (p) => p.startsWith('/api/referrals'), allow: true },
  { test: (p) => p.startsWith('/api/rating-criteria'), allow: true },
  { test: (p) => p.startsWith('/api/ratings'), allow: true },
  { test: (p) => p.startsWith('/api/interviews'), allow: true },
  { test: (p) => p.startsWith('/api/applications'), allow: true },
  { test: (p) => p.startsWith('/api/agents'), allow: true },
];

/** Can this role mutate at this path? (POST / PUT / PATCH / DELETE) */
export function canWrite(role: Role, pathname: string): boolean {
  if (matchesPrefix(pathname, COMMON_PREFIXES)) return true;
  if (role === 'admin') return true;
  // Management mirrors Admin's view with every write withheld.
  if (role === 'management') return false;
  const rules =
    role === 'leadgen' ? LEADGEN_WRITE_RULES : role === 'sales' ? SALES_WRITE_RULES : TA_WRITE_RULES;
  for (const rule of rules) {
    if (rule.test(pathname)) return rule.allow;
  }
  return false;
}

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * What the client pays is commercial information TA does not get. The hiring
 * budget — what we can offer a candidate — takes its place on their screens.
 *
 * `dealValue` goes with it: pipeline value IS client-facing money, and leaving
 * it would hand back through one field exactly what the other two withhold.
 * Nulling all three also makes opportunityValue() return null for TA, so their
 * cards read "—" rather than a figure derived from data they cannot see.
 *
 * Applied server-side on the way out rather than hidden with CSS, so the
 * numbers are never in the payload the browser receives.
 */
export function stripClientBudget<T extends Record<string, unknown>>(
  role: Role,
  row: T,
): T {
  if (role === 'ta') return { ...row, budgetMin: null, budgetMax: null, dealValue: null };
  // Leadgen takes the requirement to budgeting, so the client budget is
  // theirs to record. Deal value and pipeline value are not — those are what
  // the deal is worth to us, which is the sales side of the line.
  if (role === 'leadgen') return { ...row, dealValue: null };
  return row;
}

export function stripClientBudgetAll<T extends Record<string, unknown>>(
  role: Role,
  rows: T[],
): T[] {
  if (role !== 'ta') return rows;
  return rows.map((r) => stripClientBudget(role, r));
}
