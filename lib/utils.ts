import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const GST_RATE = 0.18;

/** Rows per page on every listing table. */
export const LIST_PAGE_SIZE = 20;

/** Indian numbering format, no decimals. */
export function formatINR(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Compact form for dashboard tiles: ₹12.5L, ₹1.2Cr. */
export function formatINRCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(value) >= 1_00_000) return `₹${(value / 1_00_000).toFixed(2)}L`;
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
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
  if (min != null && max != null)
    return `${formatINRCompact(min)} – ${formatINRCompact(max)}`;
  return formatINRCompact(min ?? max);
}

export function isFollowUpDue(nextStepDate: string | null | undefined): boolean {
  if (!nextStepDate) return false;
  return nextStepDate <= today();
}

export function isInvoiceOverdue(status: string, dueDate: string | null): boolean {
  if (status === 'collected' || status === 'not_raised' || !dueDate) return false;
  return dueDate < today();
}
