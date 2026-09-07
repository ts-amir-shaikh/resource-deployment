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
};

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
