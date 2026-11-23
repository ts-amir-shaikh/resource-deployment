import type { Currency, MoneyByCurrency } from './money';

export type { Currency, MoneyByCurrency };

/** Same envelope on every endpoint. */
export interface Envelope<T> {
  meta: {
    version: 'v1';
    /** When the figures were computed (a cached result keeps its original time). */
    generatedAt: string;
    /** The Asia/Kolkata calendar date all date logic used. */
    asOf: string;
    timezone: 'Asia/Kolkata';
    scope: string;
    currencyPolicy: 'per-currency, never converted';
    params: Record<string, string | number | boolean>;
    pagination?: { limit: number; offset: number; total: number; truncated: boolean };
    notes: string[];
  };
  data: T;
}

export interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, string> };
}

/* ── 1. Billing ─────────────────────────────────────────────── */

export interface BillingReport {
  totals: {
    contractedMonthly: MoneyByCurrency;
    activeBillableDeployments: number;
    billedResources: number;
  };
  clients: {
    clientId: number;
    clientName: string;
    contractedMonthly: MoneyByCurrency;
    activeBillableDeployments: number;
    projects: number;
    billedResources: number;
  }[];
}

/* ── 2. Invoices ────────────────────────────────────────────── */

export interface InvoicesReport {
  totals: {
    invoiced: MoneyByCurrency;
    notRaised: MoneyByCurrency;
    outstanding: MoneyByCurrency;
    overdue: MoneyByCurrency;
    markedCollected: MoneyByCurrency;
    overdueCount: number;
  };
  aging: {
    currency: Currency;
    notYetDue: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    d90plus: number;
    noDueDate: number;
  }[];
  clients: {
    clientId: number;
    clientName: string;
    currency: Currency;
    invoiced: number;
    outstanding: number;
    overdue: number;
    markedCollected: number;
    invoiceCount: number;
    oldestOverdueDays: number | null;
  }[];
}

/* ── 3. Capacity ────────────────────────────────────────────── */

export interface CapacityReport {
  headcount: number;
  allocation: { billablePct: number; shadowPct: number; freePct: number };
  utilisationPct: number;
  bench: {
    fullyBench: number;
    partiallyAvailable: number;
    fullyAllocated: number;
    shadowOnly: number;
    availableFte: number;
  };
  bySkill: {
    primarySkill: string | null;
    headcount: number;
    availableFte: number;
    fullyBench: number;
  }[];
}

/* ── 4. Pipeline ────────────────────────────────────────────── */

export type OpportunityStage =
  | 'requirement'
  | 'qualification'
  | 'budgeting'
  | 'candidate_mapping'
  | 'interview'
  | 'agreement'
  | 'won'
  | 'lost'
  | 'hold';

export type CandidateStatus =
  | 'mapped'
  | 'screening'
  | 'submitted'
  | 'interview'
  | 'selected'
  | 'offered'
  | 'joined'
  | 'rejected'
  | 'withdrawn';

export interface PipelineReport {
  byStage: {
    stage: OpportunityStage;
    requirements: number;
    positions: number;
    /** Mappings, not people: someone mapped to two requirements counts twice. */
    mappedCandidates: Record<CandidateStatus, number>;
  }[];
  open: {
    requirements: number;
    positions: number;
    /** Capped: per requirement, min(mappings in a filled status, required positions). */
    filledPositions: number;
    unfilledPositions: number;
    fulfilmentPct: number | null;
    /** Uncapped: every mapping in selected/offered/joined on an open requirement. */
    mappingsInFilledStatus: number;
  };
  closedLast90d: { won: number; lost: number };
  onHold: number;
  followUpsDue: number;
  byClient?: {
    clientId: number;
    clientName: string;
    openRequirements: number;
    openPositions: number;
    filledPositions: number;
  }[];
}

/* ── 5. Renewals ────────────────────────────────────────────── */

export interface RenewalsReport {
  agreements: {
    /** Live (status active) agreements that have not been renewed. */
    chainHeads: number;
    expiring: number;
    lapsed: number;
    /** Superseded versions whose end date falls in the window; covered by a successor. */
    alreadyRenewed: number;
    exposureByBucket: {
      bucket: '0-30' | '31-60' | '61-90' | '91+' | 'lapsed';
      count: number;
      contractValue: MoneyByCurrency;
    }[];
    items: {
      agreementId: number;
      clientId: number;
      clientName: string;
      projectName: string;
      title: string;
      currency: Currency;
      value: number;
      endDate: string;
      daysToExpiry: number;
      state: 'expiring' | 'lapsed';
      renewalVersion: number;
    }[];
    dataQuality: { supersededButActive: number };
  };
  deployments: {
    endingInWindow: number;
    openEnded: number;
    monthlyBillingEnding: MoneyByCurrency;
    byBucket: { bucket: string; count: number; monthlyBilling: MoneyByCurrency }[];
  };
}
