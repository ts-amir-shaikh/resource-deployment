import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GST_RATE = 0.18;

/** Rows per page on every listing table. */
export const LIST_PAGE_SIZE = 20;

export type Currency = 'INR' | 'AED' | 'USD';

export const CURRENCY_OPTIONS: { value: Currency; label: string; symbol: string }[] = [
  { value: 'INR', label: 'INR — Indian Rupee', symbol: '₹' },
  { value: 'AED', label: 'AED — UAE Dirham', symbol: 'AED' },
  { value: 'USD', label: 'USD — US Dollar', symbol: '$' },
];

/** GST is an Indian tax; it has no meaning on a contract billed in AED or USD. */
export function gstApplies(currency: Currency | string | null | undefined): boolean {
  return (currency ?? 'INR') === 'INR';
}

function normalise(currency: Currency | string | null | undefined): Currency {
  return currency === 'AED' || currency === 'USD' ? currency : 'INR';
}

/**
 * Formats an amount in its own currency.
 *
 * This replaced `formatINR`, and the signature changed rather than gaining an
 * optional second argument on purpose: an optional parameter would have let
 * every existing call site keep compiling while silently printing AED figures
 * with a ₹ in front. Making it required forced all of them to be revisited.
 */
export function formatMoney(
  value: number | null | undefined,
  currency: Currency | string | null | undefined,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const code = normalise(currency);
  return new Intl.NumberFormat(code === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency: code,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Compact form for dashboard tiles and dense tables.
 *
 * Lakh and crore are an Indian convention and would be wrong on a dirham or
 * dollar figure, so only INR uses them; AED and USD get K/M.
 */
export function formatMoneyCompact(
  value: number | null | undefined,
  currency: Currency | string | null | undefined,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const code = normalise(currency);
  const sym = code === 'INR' ? '₹' : code === 'USD' ? '$' : 'AED ';
  const abs = Math.abs(value);

  if (code === 'INR') {
    if (abs >= 1_00_00_000) return `${sym}${(value / 1_00_00_000).toFixed(2)}Cr`;
    if (abs >= 1_00_000) return `${sym}${(value / 1_00_000).toFixed(2)}L`;
    if (abs >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
    return `${sym}${value.toFixed(0)}`;
  }

  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}K`;
  return `${sym}${value.toFixed(0)}`;
}

/**
 * An amount that exists in more than one currency at once — the shape every
 * rollup returns now that deployments, agreements and invoices each carry
 * their own currency.
 *
 * Deliberately NOT a single converted number: summing ₹ and AED into one
 * figure requires an exchange rate, and a rate applied at read time makes last
 * quarter's revenue move when someone edits a rate table. Invoices lock a rate
 * at creation for the future reporting module; the dashboard does not convert.
 */
export type MoneyByCurrency = { currency: Currency; amount: number }[];

/** "₹42.3L · AED 180K" — every currency present, none of them added together. */
export function formatMoneyMulti(
  entries: MoneyByCurrency | null | undefined,
  opts: { compact?: boolean; zero?: string } = {},
): string {
  const { compact = true, zero = '—' } = opts;
  const shown = (entries ?? []).filter((e) => e.amount !== 0);
  if (shown.length === 0) return zero;
  const fmt = compact ? formatMoneyCompact : formatMoney;
  return shown
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .map((e) => fmt(e.amount, e.currency))
    .join(' · ');
}

/** Folds `{ currency, amount }` rows into one entry per currency. */
export function sumByCurrency(
  rows: { currency: string; amount: number }[],
): MoneyByCurrency {
  const totals = new Map<string, number>();
  for (const r of rows) {
    totals.set(r.currency, (totals.get(r.currency) ?? 0) + (r.amount ?? 0));
  }
  return [...totals].map(([currency, amount]) => ({
    currency: currency as Currency,
    amount,
  }));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** ISO date `n` days from `date`; negative `n` goes backwards. */
export function addDays(date: string, n: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * How long something may sit untouched before it is worth flagging.
 *
 * One threshold for the whole app: the candidate-mapping stall list (Phase 11)
 * and days-in-stage on the requirement both read it, so the two cannot drift
 * into disagreeing about what "stale" means. Lives here rather than in
 * queries.ts because that module is server-only and the boards are client
 * components.
 */
export const STALL_DAYS = 14;

/**
 * Whole days since `from`, never negative.
 *
 * Timestamps carry a time of day; comparing them raw makes "yesterday
 * evening" a day old and "this morning" zero, which reads as inconsistent on
 * a board. Both ends are cut to the date first.
 */
export function daysInStage(since: string): number {
  return Math.max(0, daysBetween(since.slice(0, 10), today()));
}

/** "today" / "3d" / "27d" — the compact form for a list cell or a card. */
export function daysInStageLabel(since: string): string {
  const d = daysInStage(since);
  return d === 0 ? 'today' : `${d}d`;
}

/** Negative when the date is in the past. */
export function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  return daysBetween(today(), date);
}

export function parseSkills(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  not_raised: 'Not Raised',
  raised: 'Raised',
  pending_collection: 'Pending to Collect',
  collected: 'Collected',
};

/** Forward-only lifecycle. */
export const INVOICE_STATUS_ORDER = [
  'not_raised',
  'raised',
  'pending_collection',
  'collected',
] as const;

export function nextInvoiceStatus(current: string): string | null {
  const i = INVOICE_STATUS_ORDER.indexOf(current as never);
  if (i === -1 || i === INVOICE_STATUS_ORDER.length - 1) return null;
  return INVOICE_STATUS_ORDER[i + 1];
}

/* ── Pipeline labels ───────────────────────────────────────── */

export const STAGE_LABELS: Record<string, string> = {
  requirement: 'Requirement',
  qualification: 'Qualification',
  budgeting: 'Budgeting',
  candidate_mapping: 'Candidate Mapping',
  interview: 'Interview',
  agreement: 'Agreement',
  won: 'Won',
  lost: 'Lost',
  hold: 'On Hold',
};

export const ACTIVE_STAGES = [
  'requirement',
  'qualification',
  'budgeting',
  'candidate_mapping',
  'interview',
  'agreement',
] as const;

export const CANDIDATE_STATUS_LABELS: Record<string, string> = {
  mapped: 'Mapped',
  screening: 'Screening',
  submitted: 'Submitted',
  interview: 'Interview',
  selected: 'Selected',
  offered: 'Offered',
  joined: 'Joined',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

export const SOURCE_LABELS: Record<string, string> = {
  in_house: 'In-house',
  partner: 'Partner',
  agency: 'Agency',
  referral: 'Referral',
  self: 'Self-sourced',
};

/** Every source, in the order the form and the filter strip offer them. */
export const CANDIDATE_SOURCE_VALUES = [
  'in_house',
  'partner',
  'agency',
  'referral',
  'self',
] as const;

/**
 * Sources that involve no third party — nothing to name, nobody to credit.
 *
 * A set, deliberately, rather than the `source === 'in_house'` comparisons this
 * replaces. Those are how adding a source silently inherits the wrong rule:
 * 'self' would have started demanding the name of a partner it does not have,
 * the same shape as the access regex that once let TA create client records.
 * Lives here rather than in schema.ts so the form and the API share one
 * definition without the client bundle pulling in Drizzle.
 */
export const SOURCES_WITHOUT_PARTNER: readonly string[] = ['in_house', 'self'];

/** Only an in-house candidate can be linked to a bench resource. */
export function sourceAllowsBenchLink(source: string): boolean {
  return source === 'in_house';
}

export function sourceNeedsPartnerName(source: string): boolean {
  return !SOURCES_WITHOUT_PARTNER.includes(source);
}

export const WORK_MODE_LABELS: Record<string, string> = {
  onsite: 'Onsite',
  hybrid: 'Hybrid',
  remote: 'Remote',
};

export const ENGAGEMENT_LABELS: Record<string, string> = {
  c2h: 'C2H',
  contract: 'Contract',
  permanent: 'Permanent',
  pilot: 'Pilot',
};

/** "5–7 yrs", "5+ yrs", "up to 4 yrs", or an em dash when unset. */
export function formatExperience(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return '—';
  if (min != null && max != null) return `${min}–${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  return `up to ${max} yrs`;
}

export function formatBudget(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  if (min == null && max == null) return 'Not shared';
  // Opportunity budgets are pre-contract and quoted in rupees; currency is
  // introduced at the agreement, which is where a deal becomes a contract.
  if (min != null && max != null)
    return `${formatMoneyCompact(min, 'INR')} – ${formatMoneyCompact(max, 'INR')}`;
  return formatMoneyCompact(min ?? max, 'INR');
}

export function isFollowUpDue(nextStepDate: string | null | undefined): boolean {
  if (!nextStepDate) return false;
  return nextStepDate <= today();
}

export function isInvoiceOverdue(status: string, dueDate: string | null): boolean {
  if (status === 'collected' || status === 'not_raised' || !dueDate) return false;
  return dueDate < today();
}

/* ── Pipeline value (M17) ──────────────────────────────────── */

/**
 * Odds a deal at each stage eventually closes, used for the weighted pipeline.
 *
 * Deliberately a plain table rather than anything learned: with nine live
 * opportunities there is no sample to learn from, and a number invented by a
 * model would look more authoritative than a number someone chose on purpose.
 * Tune these as real hit rates emerge.
 */
export const STAGE_WIN_PROBABILITY: Record<string, number> = {
  requirement: 0.1,
  qualification: 0.25,
  budgeting: 0.4,
  candidate_mapping: 0.6,
  interview: 0.75,
  agreement: 0.9,
  won: 1,
  lost: 0,
  hold: 0,
};

export type ValuableOpportunity = {
  dealValue?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  requiredCount: number;
};

/**
 * What a requirement is worth per month, or null when there is nothing to go on.
 *
 * Returns null rather than 0 on purpose: a requirement nobody has priced is not
 * a worthless one, and rendering it as ₹0 would drag averages down and make an
 * un-costed deal look like a dead one.
 *
 * The top of the budget range is used because that is the figure being
 * negotiated toward — the floor systematically understates the pipeline.
 */
export function opportunityValue(o: ValuableOpportunity): number | null {
  if (o.dealValue !== null && o.dealValue !== undefined) return o.dealValue;
  const rate = o.budgetMax ?? o.budgetMin;
  if (rate === null || rate === undefined) return null;
  return rate * Math.max(1, o.requiredCount);
}

/**
 * Totals a set of opportunities by currency, and reports how many of them
 * actually carried a value.
 *
 * The coverage counts are not decoration. With most requirements unpriced, a
 * bare total is the value of a handful of deals wearing the label of the whole
 * pipeline — so every caller has the numbers needed to say so.
 */
export function valueSummary(
  rows: (ValuableOpportunity & { currency?: string | null; stage?: string })[],
  opts: { weighted?: boolean } = {},
): { total: MoneyByCurrency; valued: number; count: number } {
  const entries: { currency: string; amount: number }[] = [];
  let valued = 0;

  for (const r of rows) {
    const v = opportunityValue(r);
    if (v === null) continue;
    valued++;
    const weight = opts.weighted ? (STAGE_WIN_PROBABILITY[r.stage ?? ''] ?? 0) : 1;
    entries.push({ currency: r.currency ?? 'INR', amount: v * weight });
  }

  return { total: sumByCurrency(entries), valued, count: rows.length };
}

/** "2 of 9 valued" — or nothing at all once everything carries a number. */
export function coverageNote(valued: number, count: number): string | null {
  if (count === 0 || valued === count) return null;
  return `${valued} of ${count} valued`;
}

/**
 * When a candidate can actually start, as a short label.
 *
 * The last working date wins when present: a day count is an estimate from
 * whenever somebody typed it and quietly rots, a date does not. A date already
 * past means available now — information, not an error, so it is never
 * rejected upstream and reads as such here.
 */
export function availabilityLabel(
  lastWorkingDate: string | null | undefined,
  noticePeriodDays: number | null | undefined,
): string {
  if (lastWorkingDate) {
    return lastWorkingDate <= today() ? 'Available now' : `LWD ${formatDate(lastWorkingDate)}`;
  }
  if (noticePeriodDays == null) return '—';
  return noticePeriodDays === 0 ? 'Immediate' : `${noticePeriodDays}d notice`;
}

/* ── M39 / M40: cost and margin ────────────────────────────── */

/**
 * Annual CTC as a monthly figure, rounded to the rupee.
 *
 * Derived every time rather than stored, so it can never disagree with the
 * annual figure it came from. Plain division by twelve — not a payroll
 * monthly, which would need the statutory model.
 */
export function monthlyOf(annual: number | null | undefined): number | null {
  if (annual == null) return null;
  return Math.round(annual / 12);
}

/**
 * The CTC actually in force today for a resource that carries a revision.
 *
 * Revised once its effective date has passed, current before it. Anything
 * else misreports a raise that has already happened — or one that has not.
 */
export function effectiveCtc(r: {
  currentCtc: number | null;
  revisedCtc: number | null;
  revisedEffectiveFrom: string | null;
}): number | null {
  if (r.revisedCtc != null && r.revisedEffectiveFrom && r.revisedEffectiveFrom <= today()) {
    return r.revisedCtc;
  }
  return r.currentCtc;
}

export type DeploymentMoney = {
  base: number;
  gst: number;
  total: number;
  commission: number;
  overhead: number;
  /** Monthly salary cost charged to this deployment, pro-rated by allocation. */
  ctcCost: number | null;
  /** Null when it cannot be computed honestly — see `marginNote`. */
  margin: number | null;
  /** Why margin is null, for the screen to say rather than show a dash. */
  marginNote: 'needs-rate' | 'no-ctc' | null;
  /** True for a shadow: the figure is a cost, not a margin. */
  isCost: boolean;
};

/**
 * One formula, every caller.
 *
 *   margin = billing − (monthly CTC × allocation + commission + overhead)
 *
 * Three things the sentence leaves open, decided here so they cannot be
 * decided differently on different screens:
 *
 * - Allocation. A resource split 50/50 across two deployments must not have
 *   their whole salary deducted from both; cost is pro-rated.
 * - Currency. CTC is always rupees and the application never converts, so
 *   margin exists only where the deployment bills in INR. Elsewhere the
 *   deductions are still shown; only the subtraction is withheld.
 * - Shadow. A shadow bills nothing, so the figure is a pure cost and is
 *   flagged as such rather than shown as a negative margin.
 *
 * This replaces `billing − commission`, which ignored salary entirely.
 */
export function deploymentMoney(d: {
  billingAmount: number;
  commissionAmount: number;
  operationsOverhead: number;
  gstApplicable: boolean;
  allocationPercentage: number;
  currency: string;
  deploymentType: 'billable' | 'shadow';
  annualCtc: number | null;
}): DeploymentMoney {
  const gst = d.gstApplicable ? d.billingAmount * GST_RATE : 0;
  const monthly = monthlyOf(d.annualCtc);
  const ctcCost = monthly == null ? null : Math.round((monthly * d.allocationPercentage) / 100);
  const isCost = d.deploymentType === 'shadow';

  let margin: number | null = null;
  let marginNote: DeploymentMoney['marginNote'] = null;
  if (d.currency !== 'INR') marginNote = 'needs-rate';
  else if (ctcCost == null) marginNote = 'no-ctc';
  else margin = d.billingAmount - (ctcCost + d.commissionAmount + d.operationsOverhead);

  return {
    base: d.billingAmount,
    gst,
    total: d.billingAmount + gst,
    commission: d.commissionAmount,
    overhead: d.operationsOverhead,
    ctcCost,
    margin,
    marginNote,
    isCost,
  };
}

/* ── Invoice lines: pro-rating a part month ────────────────── */

/** The four figures a biller types per resource, plus the period they sit in. */
export type InvoiceLineBasis = {
  /** Full-month rate for this resource, in the invoice's currency. */
  monthlyRate: number;
  /**
   * Working days the client's month is billed on — 22 for a five-day week,
   * 26 for six, whatever the SOW says. Null means "don't pro-rate": the line
   * is a flat monthly rate and the three fields below are ignored.
   */
  workingDays: number | null;
  /** Days of leave taken inside the period. Half days are allowed. */
  leaveDays: number;
  /** First day on the engagement, when the resource joined mid-period. */
  deploymentDate: string | null;
  /** Last day, when the resource rolled off mid-period. */
  lastWorkingDate: string | null;
  periodFrom: string;
  periodTo: string;
};

export type InvoiceLineMath = {
  /** Calendar days in the billing period. */
  daysInPeriod: number;
  /** Calendar days of it the resource was actually on the engagement. */
  daysOnSite: number;
  /** Working days that window is worth, before leave. Null when not pro-rated. */
  availableDays: number | null;
  /** What the client is billed for: available days less leave. */
  billedDays: number | null;
  amount: number;
  /** True when the line came out below a full month, for whatever reason. */
  prorated: boolean;
};

/** To the nearest half day — half days are a real unit on a leave register. */
function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * What one resource is worth on one invoice.
 *
 *   billed days = (working days × share of the period they were on) − leave
 *   amount      = monthly rate × billed days ÷ working days
 *
 * Three decisions the sentence leaves open, settled here so the form preview
 * and the saved record cannot settle them differently:
 *
 * - The partial-month share is measured in CALENDAR days, not weekdays. The
 *   application holds no holiday calendar and does not know whether this
 *   client works five days or six — the biller already told us how many days
 *   the month is worth, and scaling that by the calendar share needs no
 *   further assumption. Someone on for 17 of a 31-day period is billed
 *   17/31 of the month's working days.
 * - A resource present for the whole period is billed `workingDays − leave`
 *   exactly. The share is 1, so no rounding enters the common case.
 * - Billed days are floored at zero and capped at the month's working days:
 *   leave longer than the month cannot produce a credit note by accident, and
 *   a bad date cannot bill more than a full month.
 */
export function invoiceLineMath(b: InvoiceLineBasis): InvoiceLineMath {
  // The API cannot reach this with an unusable period — the schema requires
  // two dates in order. The form can, while the biller is still filling it in,
  // and a half-typed period must not silently bill the line at zero. With no
  // period to measure against there is no partial month, so the window share
  // is a whole one and only leave moves the figure.
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const usablePeriod =
    ISO.test(b.periodFrom) && ISO.test(b.periodTo) && b.periodTo >= b.periodFrom;

  const daysInPeriod = usablePeriod ? daysBetween(b.periodFrom, b.periodTo) + 1 : 0;

  const from =
    b.deploymentDate && b.deploymentDate > b.periodFrom ? b.deploymentDate : b.periodFrom;
  const to =
    b.lastWorkingDate && b.lastWorkingDate < b.periodTo ? b.lastWorkingDate : b.periodTo;
  const daysOnSite = !usablePeriod || to < from ? 0 : daysBetween(from, to) + 1;

  if (b.workingDays == null || b.workingDays <= 0) {
    return {
      daysInPeriod,
      daysOnSite,
      availableDays: null,
      billedDays: null,
      amount: Math.round(b.monthlyRate),
      prorated: false,
    };
  }

  const share = usablePeriod ? Math.min(1, daysOnSite / daysInPeriod) : 1;
  const availableDays = roundHalf(b.workingDays * share);
  const billedDays = Math.min(
    b.workingDays,
    Math.max(0, availableDays - Math.max(0, b.leaveDays)),
  );

  return {
    daysInPeriod,
    daysOnSite,
    availableDays,
    billedDays,
    amount: Math.round((b.monthlyRate * billedDays) / b.workingDays),
    prorated: billedDays < b.workingDays,
  };
}

/** "18 of 22 days" — how a pro-rated line is labelled everywhere it appears. */
export function billedDaysLabel(m: InvoiceLineMath, workingDays: number | null): string {
  if (m.billedDays == null || workingDays == null) return 'Full month';
  return `${m.billedDays} of ${workingDays} days`;
}

/**
 * A validated line plus the invoice's period, as the row that gets stored.
 *
 * The derived columns are computed here rather than taken from the request:
 * the form sends what the biller typed, and the two figures that end up on the
 * invoice are the server's own, so a stale or edited client cannot save a
 * day count and an amount that disagree with each other.
 */
export function invoiceLineRow(
  line: {
    resourceId: number;
    monthlyRate: number;
    workingDays?: number;
    leaveDays: number;
    deploymentDate?: string;
    lastWorkingDate?: string;
  },
  period: { periodFrom: string; periodTo: string },
) {
  const math = invoiceLineMath({
    monthlyRate: line.monthlyRate,
    workingDays: line.workingDays ?? null,
    leaveDays: line.leaveDays,
    deploymentDate: line.deploymentDate ?? null,
    lastWorkingDate: line.lastWorkingDate ?? null,
    periodFrom: period.periodFrom,
    periodTo: period.periodTo,
  });
  return {
    resourceId: line.resourceId,
    monthlyRate: line.monthlyRate,
    workingDays: line.workingDays ?? null,
    leaveDays: line.leaveDays,
    deploymentDate: line.deploymentDate ?? null,
    lastWorkingDate: line.lastWorkingDate ?? null,
    billedDays: math.billedDays,
    amount: math.amount,
  };
}
