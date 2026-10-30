import { sql, relations } from 'drizzle-orm';
import { sqliteTable, integer, text, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import {
  APPROVAL_CADENCES,
  DEFAULT_FULL_DAY_HOURS,
  ENTRY_STATUSES,
  ENTRY_TYPES,
  TASK_KINDS,
  TIMESHEET_VERSIONS,
} from './timesheet-rules';
import {
  ACTIVITY_OUTCOMES,
  ACTIVITY_TYPES,
  CAMPAIGN_CHANNELS,
  CAMPAIGN_STATUSES,
  LEAD_STATUSES,
  PROSPECT_SOURCES,
  PROSPECT_STAGES,
  TEMPERATURES,
} from './leadgen-rules';
import { ACCOUNT_RATINGS, REVIEW_STATUSES } from './review-rules';
import { LEAVE_STATUSES, LEAVE_TYPES } from './leave-rules';

const timestamps = {
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
};

/* ── M1: Resources ─────────────────────────────────────────── */

export const resources = sqliteTable(
  'resources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    mobile: text('mobile'),
    designation: text('designation'),
    currentCtc: real('current_ctc'),
    revisedCtc: real('revised_ctc'),
    revisedEffectiveFrom: text('revised_effective_from'),
    primarySkill: text('primary_skill'),
    secondarySkill: text('secondary_skill'),
    /** JSON-encoded string[] */
    otherSkills: text('other_skills').default('[]').notNull(),
    ...timestamps,
  },
  (t) => ({
    primarySkillIdx: index('res_primary_skill_idx').on(t.primarySkill),
  }),
);

/* ── M2: Clients ───────────────────────────────────────────── */

export const clients = sqliteTable('clients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  companyName: text('company_name').notNull(),

  spocName: text('spoc_name'),
  spocEmail: text('spoc_email'),
  spocMobile: text('spoc_mobile'),
  spocDesignation: text('spoc_designation'),

  accountName: text('account_name'),
  accountEmail: text('account_email'),
  accountMobile: text('account_mobile'),

  altSpocName: text('alt_spoc_name'),
  altSpocEmail: text('alt_spoc_email'),
  altSpocMobile: text('alt_spoc_mobile'),
  altSpocDesignation: text('alt_spoc_designation'),

  /* M62: billing details. All nullable — a client created before these
   * existed stays valid with all four empty. */
  gstin: text('gstin'),
  billingAddress: text('billing_address'),
  paymentTerms: text('payment_terms'),
  /** Days after the invoice date; seeds a new invoice's due date. */
  defaultDueDays: integer('default_due_days'),

  ...timestamps,
});

/* ── M3: Projects ──────────────────────────────────────────── */

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id),
    projectName: text('project_name').notNull(),
    managerName: text('manager_name'),
    managerEmail: text('manager_email'),
    managerMobile: text('manager_mobile'),
    managerDesignation: text('manager_designation'),
    /** M65: the timesheet version a deployment uses when it sets none (D10). */
    timesheetVersion: text('timesheet_version', { enum: TIMESHEET_VERSIONS }).notNull().default('v1'),
    ...timestamps,
  },
  (t) => ({
    clientIdx: index('proj_client_idx').on(t.clientId),
  }),
);

/* ── M4: Deployments ───────────────────────────────────────── */

/**
 * Currencies client-facing money can be denominated in.
 *
 * Resource CTC is deliberately absent from this: that is payroll and stays in
 * rupees. Currency here covers what a client is billed — PO value, deployment
 * billing, invoice amounts.
 */
export const CURRENCIES = ['INR', 'AED', 'USD'] as const;

export const DEPLOYMENT_TYPES = ['billable', 'shadow'] as const;
export const DEPLOYMENT_STATUSES = ['active', 'ended'] as const;

export const deployments = sqliteTable(
  'deployments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    /**
     * The commercial agreement/PO this deployment bills under. Nullable —
     * older deployments and simple engagements with no formal PO predate
     * this link. When set, the resource picker and billing amount in the
     * deployment form are drawn from this agreement's registered resources
     * (agreement_resources) rather than typed by hand.
     */
    agreementId: integer('agreement_id').references(() => agreements.id),

    deploymentType: text('deployment_type', { enum: DEPLOYMENT_TYPES })
      .notNull()
      .default('billable'),
    /** 1-100. Sum across a resource's active deployments must be <= 100. */
    allocationPercentage: integer('allocation_percentage').notNull().default(100),

    startDate: text('start_date').notNull(),
    endDate: text('end_date'),

    /**
     * Denominated currency. Inherited and locked from the linked agreement
     * when one is set; free to choose when the deployment has no PO behind it
     * (agreementId is nullable).
     */
    currency: text('currency', { enum: CURRENCIES }).notNull().default('INR'),

    /** Forced to 0 for shadow deployments. */
    billingAmount: real('billing_amount').default(0).notNull(),
    commissionAmount: real('commission_amount').default(0).notNull(),
    /**
     * M40: what it costs to run this engagement beyond salary and commission
     * — tooling, a US-shift allowance, a client-mandated laptop. Per
     * deployment rather than a global rate, because a US-timezone engagement
     * and a local one do not cost the same to operate. An amount, matching
     * commission; forced to 0 for shadow deployments the same way.
     */
    operationsOverhead: real('operations_overhead').default(0).notNull(),
    gstApplicable: integer('gst_applicable', { mode: 'boolean' })
      .default(true)
      .notNull(),

    status: text('status', { enum: DEPLOYMENT_STATUSES })
      .notNull()
      .default('active'),

    /**
     * M65 (D10). Set per deployment because a deployment already is
     * resource × project: a resource on two projects set differently has no
     * conflict to resolve. Null means "use the project's default".
     */
    timesheetVersion: text('timesheet_version', { enum: TIMESHEET_VERSIONS }),
    /** D9: hours that make a full billable day here. */
    fullDayHours: real('full_day_hours').notNull().default(DEFAULT_FULL_DAY_HOURS),
    /** D3: how this deployment's entries are grouped for approval. */
    approvalCadence: text('approval_cadence', { enum: APPROVAL_CADENCES }).notNull().default('weekly'),
    ...timestamps,
  },
  (t) => ({
    resourceIdx: index('depl_resource_idx').on(t.resourceId),
    projectIdx: index('depl_project_idx').on(t.projectId),
    statusIdx: index('depl_status_idx').on(t.status),
    agreementIdx: index('depl_agreement_idx').on(t.agreementId),
  }),
);

/* ── M6: Agreements / POs ──────────────────────────────────── */

export const AGREEMENT_SCOPES = ['individual', 'team'] as const;
export const AGREEMENT_STATUSES = ['active', 'expired', 'renewed'] as const;

export const agreements = sqliteTable(
  'agreements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    /** Self-reference: the agreement this one renews. Null for v1. */
    parentAgreementId: integer('parent_agreement_id'),

    agreementNumber: text('agreement_number'),
    title: text('title').notNull(),
    scope: text('scope', { enum: AGREEMENT_SCOPES }).notNull().default('individual'),

    /** A PO is signed in one currency; this is the source of truth for the
     *  deployments and invoices that hang off it. */
    currency: text('currency', { enum: CURRENCIES }).notNull().default('INR'),

    value: real('value').notNull(),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),

    renewalVersion: integer('renewal_version').notNull().default(1),
    status: text('status', { enum: AGREEMENT_STATUSES }).notNull().default('active'),
    notes: text('notes'),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index('agr_project_idx').on(t.projectId),
    parentIdx: index('agr_parent_idx').on(t.parentAgreementId),
    statusIdx: index('agr_status_idx').on(t.status),
  }),
);

/** Junction: which resources an agreement covers, at what rate. */
export const agreementResources = sqliteTable(
  'agreement_resources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agreementId: integer('agreement_id')
      .notNull()
      .references(() => agreements.id, { onDelete: 'cascade' }),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id),
    billingAmount: real('billing_amount').default(0).notNull(),
  },
  (t) => ({
    agreementIdx: index('agrres_agreement_idx').on(t.agreementId),
  }),
);

/* ── M7: Invoices ──────────────────────────────────────────── */

export const INVOICE_SCOPES = ['individual', 'team'] as const;
export const INVOICE_STATUSES = [
  'not_raised',
  'raised',
  'pending_collection',
  'collected',
] as const;

export const invoices = sqliteTable(
  'invoices',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    agreementId: integer('agreement_id').references(() => agreements.id),

    invoiceNumber: text('invoice_number'),
    scope: text('scope', { enum: INVOICE_SCOPES }).notNull().default('individual'),

    periodFrom: text('period_from').notNull(),
    periodTo: text('period_to').notNull(),

    /** Inherited from the agreement when linked. An invoice keeps the currency
     *  it was RAISED in even if the agreement is later corrected. */
    currency: text('currency', { enum: CURRENCIES }).notNull().default('INR'),

    /**
     * Rate to INR captured at the moment this invoice was raised — 1 for INR.
     *
     * Nothing reads this yet. It exists so a later reporting module can state
     * consolidated revenue using the rate that actually applied on the day,
     * rather than today's. That history cannot be reconstructed after the
     * fact, which is why the column ships with the currency rather than with
     * the feature that consumes it.
     */
    fxRateToInr: real('fx_rate_to_inr').notNull().default(1),

    amount: real('amount').notNull(),
    /** Indian tax — forced to 0 unless the currency is INR. */
    gstAmount: real('gst_amount').default(0).notNull(),

    invoiceDate: text('invoice_date'),
    dueDate: text('due_date'),
    collectedDate: text('collected_date'),

    status: text('status', { enum: INVOICE_STATUSES })
      .notNull()
      .default('not_raised'),
    notes: text('notes'),
    /** M62: the other system's record of this invoice, written back through
     *  the integration API. Nullable — most invoices will never have one. */
    externalId: text('external_id'),
    externalReference: text('external_reference'),
    ...timestamps,
  },
  (t) => ({
    projectIdx: index('inv_project_idx').on(t.projectId),
    agreementIdx: index('inv_agreement_idx').on(t.agreementId),
    statusIdx: index('inv_status_idx').on(t.status),
  }),
);

/**
 * One billed line of an invoice: the resource, and the day count behind their
 * share of it.
 *
 * Started life as a bare junction table — which resources an invoice covered,
 * and nothing about what each was worth. The amount lived only as the
 * invoice's single total, so a client query ("why is Priya's line short this
 * month?") could not be answered from the record. These columns hold the four
 * inputs the answer is made of, plus the two figures derived from them, so a
 * line raised months ago can still be explained without recomputing it from
 * whatever the rate card says today.
 */
export const invoiceResources = sqliteTable(
  'invoice_resources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id),

    /** Full-month rate for this resource, as the line was priced. */
    monthlyRate: real('monthly_rate').notNull().default(0),
    /**
     * Working days the client's month is billed on — 22, 26, whatever the SOW
     * says. NULL means the line was not pro-rated at all and is a flat month,
     * which is how every invoice raised before this feature was priced.
     */
    workingDays: real('working_days'),
    /**
     * Retired in M59, kept so lines priced before the split still read. Its
     * value was leave that came off the bill, which is now
     * `unpaidLeaveDays`; nothing writes this column any more.
     */
    leaveDays: real('leave_days').notNull().default(0),
    /**
     * Leave the client has agreed to pay for under the SOW. Recorded, and
     * deliberately NOT deducted: the day is billable. It is held because the
     * salary goes out either way — a real cost against margin — and because an
     * allowance ("five paid days a month") can only be enforced once the
     * figure exists.
     */
    paidLeaveDays: real('paid_leave_days').notNull().default(0),
    /** Leave that comes off the invoice. This is the term that moves money. */
    unpaidLeaveDays: real('unpaid_leave_days').notNull().default(0),
    /** The resource's first day on the engagement, when it falls inside the
     *  billing period. NULL means they were already on it at period start. */
    deploymentDate: text('deployment_date'),
    /** Their last day, when it falls inside the period. NULL means they ran
     *  through to period end. */
    lastWorkingDate: text('last_working_date'),

    /** Derived: days actually billed, after the window and leave are applied. */
    billedDays: real('billed_days'),
    /** Derived: this line's share of the invoice, in the invoice's currency. */
    amount: real('amount').notNull().default(0),
    /**
     * M65: the leave figures came from approved timesheets, not the biller.
     * Set by the server only, when every expected day of the line was
     * approved; the line then shows where its numbers came from.
     */
    leaveFromTimesheet: integer('leave_from_timesheet', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => ({
    invoiceIdx: index('invres_invoice_idx').on(t.invoiceId),
  }),
);

/* ── M8: Opportunities / Pipeline ──────────────────────────── */

/** Active pipeline stages, in order. Movement is bidirectional. */
export const PIPELINE_STAGES = [
  'requirement',
  'qualification',
  'budgeting',
  'candidate_mapping',
  'interview',
  'agreement',
] as const;

export const TERMINAL_STAGES = ['won', 'lost', 'hold'] as const;

export const OPPORTUNITY_STAGES = [
  ...PIPELINE_STAGES,
  ...TERMINAL_STAGES,
] as const;

export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const;
export const ENGAGEMENT_TYPES = ['c2h', 'contract', 'permanent', 'pilot'] as const;
export const PRIORITIES = ['low', 'medium', 'high'] as const;

export const opportunities = sqliteTable(
  'opportunities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Null means the company is a prospect, not yet an onboarded client. */
    clientId: integer('client_id').references(() => clients.id),
    companyName: text('company_name').notNull(),

    title: text('title').notNull(),
    experienceMin: integer('experience_min'),
    experienceMax: integer('experience_max'),
    primarySkill: text('primary_skill'),
    secondarySkill: text('secondary_skill'),
    otherSkills: text('other_skills').default('[]').notNull(),

    workMode: text('work_mode', { enum: WORK_MODES }),
    location: text('location'),
    timezone: text('timezone'),
    engagementType: text('engagement_type', { enum: ENGAGEMENT_TYPES }),

    requiredCount: integer('required_count').notNull().default(1),
    /** What the client pays. Hidden from the TA role — stripped server-side. */
    /**
     * Currency for every money figure on this requirement.
     *
     * Phase 4 left opportunities in rupees on the grounds that currency starts
     * at the contract. Attaching a deal value to a requirement changes that: a
     * Dubai role is worth dirhams, and folding it into a rupee pipeline total
     * would reintroduce exactly the bug M14 removed.
     */
    currency: text('currency', { enum: CURRENCIES }).notNull().default('INR'),

    budgetMin: real('budget_min'),
    budgetMax: real('budget_max'),

    /**
     * Monthly value of the deal, overriding what would be derived from
     * budget × positions.
     *
     * Not merely a convenience: most requirements are logged before a budget is
     * agreed, so for the majority this is the only number there will be.
     */
    dealValue: real('deal_value'),
    /** What TA can offer a candidate. Shown to TA in place of client budget. */
    hiringBudgetMin: real('hiring_budget_min'),
    hiringBudgetMax: real('hiring_budget_max'),

    jdContent: text('jd_content'),
    workingDays: text('working_days'),
    workingHours: text('working_hours'),

    stage: text('stage', { enum: OPPORTUNITY_STAGES }).notNull().default('requirement'),
    priority: text('priority', { enum: PRIORITIES }).default('medium'),
    /**
     * Free-text owner, kept as-is. It is the only record of who owned things
     * before accounts existed, and two names in live data ('Rakesh Samal',
     * 'Yogini Patil') match no account at all — dropping it would lose them.
     */
    /**
     * Free-text owner, retired in M42. Kept as a column so old rows still
     * read, but nothing writes it: the three account-linked owners below and
     * the assignee table are the record now.
     */
    owner: text('owner'),
    /** The account that owns this requirement. Null where the name matched none. */
    /**
     * Retired in M42 — migrated into `opportunity_assignees` as the first TA
     * assignee. Nothing reads it any more; see `opportunityAssignees`.
     */
    ownerUserId: integer('owner_user_id'),
    /** M42: who brought the requirement in. Single; set on create or by Admin / leadgen head. */
    leadOwnerUserId: integer('lead_owner_user_id'),
    /** M42: who owns closing it. Single; set by Admin or a sales head. */
    salesOwnerUserId: integer('sales_owner_user_id'),
    /** M46: the prospect this was raised against, until it becomes a client. */
    prospectId: integer('prospect_id').references(() => prospects.id),
    /**
     * M66: the lead this was raised from (D4). Null for requirements created
     * directly, which stays allowed (Q7).
     */
    leadId: integer('lead_id').references(() => leads.id),

    nextStep: text('next_step'),
    nextStepDate: text('next_step_date'),
    /** Required when moving to lost or hold. */
    closedReason: text('closed_reason'),

    /* ── M16: public job board ──────────────────────────────
     * Listing is opt-in and off by default: a requirement becomes visible to
     * the world only when someone deliberately publishes it. Nothing here is
     * ever read by the internal screens — it exists purely to shape what the
     * public sees. */

    isListed: integer('is_listed', { mode: 'boolean' }).notNull().default(false),
    /** When it went live — drives "posted 3 days ago" and newest-first order. */
    listedAt: text('listed_at'),
    /** Advert headline. The internal title is rarely the right one. */
    publicTitle: text('public_title'),
    /**
     * What stands in for the client on a public page, e.g. "A leading retail
     * group". The board must not leak who we staff for: competitors read it,
     * and candidates would approach the client directly.
     */
    publicCompanyLabel: text('public_company_label'),
    /**
     * When the JD text last changed (M28).
     *
     * Exists so a generated question set can say whether it is still describing
     * the current requirement. `createdAt` cannot answer that, and the table has
     * no updated_at — and adding a blanket one would mark the questions stale
     * every time somebody corrected a priority or a next-step date.
     */
    jdUpdatedAt: text('jd_updated_at'),
    /** Per-requirement opt-in to naming the client outright. */
    showClientName: integer('show_client_name', { mode: 'boolean' })
      .notNull()
      .default(false),

    /** Unguessable token backing the read-only stakeholder share page. */
    shareToken: text('share_token').notNull().unique(),
    /** Set once a won opportunity has been converted into a project. */
    convertedProjectId: integer('converted_project_id').references(() => projects.id),

    ...timestamps,
  },
  (t) => ({
    stageIdx: index('opp_stage_idx').on(t.stage),
    clientIdx: index('opp_client_idx').on(t.clientId),
    tokenIdx: index('opp_token_idx').on(t.shareToken),
  }),
);

/* ── M9: Candidates ────────────────────────────────────────── */

export const CANDIDATE_SOURCES = [
  'in_house',
  'partner',
  'agency',
  'referral',
  /** M35: the recruiter found this person themselves — job board, network, own search. */
  'self',
] as const;


export const candidates = sqliteTable(
  'candidates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Set when an in-house candidate is an existing bench resource. */
    resourceId: integer('resource_id').references(() => resources.id),

    name: text('name').notNull(),
    email: text('email'),
    mobile: text('mobile'),
    currentDesignation: text('current_designation'),
    experienceYears: real('experience_years'),

    primarySkill: text('primary_skill'),
    secondarySkill: text('secondary_skill'),
    otherSkills: text('other_skills').default('[]').notNull(),

    currentCtc: real('current_ctc'),
    expectedCtc: real('expected_ctc'),
    noticePeriodDays: integer('notice_period_days'),
    /**
     * M34: the date they are actually free.
     *
     * Supersedes `noticePeriodDays` where both exist — a day count is an
     * estimate from whenever it was typed and rots silently, a date does not.
     * A date already past means available now, which is information rather than
     * an error, so nothing validates it against today.
     */
    lastWorkingDate: text('last_working_date'),
    location: text('location'),

    source: text('source', { enum: CANDIDATE_SOURCES }).notNull().default('in_house'),
    /** Required for partner/agency/referral; null for in-house and self. */
    sourceName: text('source_name'),

    /**
     * M32: a link to the CV wherever it already lives — Drive, SharePoint, the
     * agency's portal.
     *
     * A reference, not a copy. Storing the document itself would build an
     * archive of third-party personal data with its own retention problem,
     * which is the reason the agents have never persisted an upload either.
     * Validated to http/https on the way in: rendered as an anchor, this field
     * would otherwise accept `javascript:`.
     */
    resumeUrl: text('resume_url'),

    /**
     * M35: who added this profile. From the session, never the payload.
     *
     * Needed for source 'self' to mean anything — "a recruiter found them" and
     * not which recruiter is a fact nobody can act on. Recorded for every
     * source, since "who added this" is worth having regardless.
     */
    createdByUserId: integer('created_by_user_id'),

    notes: text('notes'),
    ...timestamps,
  },
  (t) => ({
    sourceIdx: index('cand_source_idx').on(t.source),
    skillIdx: index('cand_skill_idx').on(t.primarySkill),
    resourceIdx: index('cand_resource_idx').on(t.resourceId),
  }),
);

/** Per-candidate interview progress, scoped to one opportunity. */
export const CANDIDATE_STATUSES = [
  'mapped',
  'screening',
  'submitted',
  'interview',
  'selected',
  'offered',
  'joined',
  'rejected',
  'withdrawn',
] as const;

export const opportunityCandidates = sqliteTable(
  'opportunity_candidates',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityId: integer('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    candidateId: integer('candidate_id')
      .notNull()
      .references(() => candidates.id),

    status: text('status', { enum: CANDIDATE_STATUSES }).notNull().default('mapped'),
    interviewRound: integer('interview_round').default(0).notNull(),
    interviewDate: text('interview_date'),
    feedback: text('feedback'),
    expectedBilling: real('expected_billing'),
    /**
     * M30-3: when `status` last changed. Stall detection — "has not moved in
     * two weeks" — is impossible from `createdAt` alone, and every status
     * write goes through the two routes that now stamp this.
     */
    statusChangedAt: text('status_changed_at'),
    /**
     * M30-5: the offer-to-join gap, which is where a placement most often
     * falls through. `offeredAt` is stamped the first time status reaches
     * 'offered'; the expected join date is typed by the recruiter.
     */
    offeredAt: text('offered_at'),
    expectedJoinDate: text('expected_join_date'),
    /** Who mapped this candidate, and who last moved its interview state. */
    userId: integer('user_id'),
    updatedByUserId: integer('updated_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    oppIdx: index('oppcand_opp_idx').on(t.opportunityId),
    candIdx: index('oppcand_cand_idx').on(t.candidateId),
  }),
);

/** Discussion thread. Stakeholder comments arrive via the share link. */
export const COMMENT_AUTHOR_ROLES = ['internal', 'stakeholder'] as const;

export const opportunityComments = sqliteTable(
  'opportunity_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityId: integer('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    author: text('author').notNull(),
    /** Written from the session, never typed. Null on rows predating M21. */
    userId: integer('user_id'),
    authorRole: text('author_role', { enum: COMMENT_AUTHOR_ROLES })
      .notNull()
      .default('internal'),
    body: text('body').notNull(),
    isFollowup: integer('is_followup', { mode: 'boolean' }).default(false).notNull(),
    followUpDate: text('follow_up_date'),
    ...timestamps,
  },
  (t) => ({
    oppIdx: index('oppcomment_opp_idx').on(t.opportunityId),
  }),
);

/** Audit log of stage movement. Also used to resume from 'hold'. */
export const opportunityStageHistory = sqliteTable(
  'opportunity_stage_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityId: integer('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    fromStage: text('from_stage'),
    toStage: text('to_stage').notNull(),
    note: text('note'),
    /** Who moved it. Null on rows predating M21. */
    userId: integer('user_id'),
    ...timestamps,
  },
  (t) => ({
    oppIdx: index('oppstage_opp_idx').on(t.opportunityId),
  }),
);

/* ── M22: Candidate rating criteria ────────────────────────── */

export const CRITERION_SCOPES = ['global', 'opportunity'] as const;

/**
 * The pointers a recruiter scores a candidate against.
 *
 * A library rather than a fixed form: a criterion added while evaluating one
 * candidate joins the set offered for the next, so the team converges on a
 * shared vocabulary instead of each recruiter inventing their own.
 */
export const ratingCriteria = sqliteTable(
  'rating_criteria',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    label: text('label').notNull(),
    description: text('description'),
    /** 'global' applies everywhere; 'opportunity' is specific to one requirement. */
    scope: text('scope', { enum: CRITERION_SCOPES }).notNull().default('global'),
    opportunityId: integer('opportunity_id').references(() => opportunities.id, {
      onDelete: 'cascade',
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    /**
     * Retired criteria are deactivated, never deleted: scores already given
     * against one must stay readable, which they would not be if the row went.
     */
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    createdByUserId: integer('created_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    scopeIdx: index('crit_scope_idx').on(t.scope),
    opportunityIdx: index('crit_opportunity_idx').on(t.opportunityId),
  }),
);

/**
 * One score per criterion per evaluation.
 *
 * Keyed on the candidate-to-opportunity mapping, not the candidate: the same
 * person can be strong for one requirement and weak for another, and a single
 * profile score could never say that.
 */
export const candidateRatings = sqliteTable(
  'candidate_ratings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityCandidateId: integer('opportunity_candidate_id')
      .notNull()
      .references(() => opportunityCandidates.id, { onDelete: 'cascade' }),
    criterionId: integer('criterion_id')
      .notNull()
      .references(() => ratingCriteria.id),
    /**
     * Which round produced this score. Null means the profile-level screening
     * score — which is every row written before M29, so nothing already
     * recorded changes meaning.
     */
    interviewId: integer('interview_id').references(() => candidateInterviews.id, {
      onDelete: 'cascade',
    }),
    /** 1–5. Unweighted; weighting waits for real hiring data. */
    score: integer('score').notNull(),
    note: text('note'),
    ratedByUserId: integer('rated_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    mappingIdx: index('rating_mapping_idx').on(t.opportunityCandidateId),
    criterionIdx: index('rating_criterion_idx').on(t.criterionId),
  }),
);

/* ── M29: Interview rounds and panel ───────────────────────── */

export const INTERVIEW_MODES = ['internal_screening', 'client_round', 'final'] as const;

/** Null until the round has actually been held. */
export const INTERVIEW_OUTCOMES = ['pass', 'fail', 'hold', 'no_show'] as const;

/**
 * One row per interview round, per candidate, per requirement.
 *
 * Replaces a single `feedback` column on the mapping that the next round
 * overwrote — so a candidate rejected in round three had the reason they were
 * advanced in round one silently destroyed. History is the whole point of this
 * table; nothing here is ever edited away by a later round.
 *
 * The client-facing round lives here too, distinguished by `mode`, rather than
 * in a table of its own: split across two places, a candidate's history stops
 * being readable in one pass.
 */
export const candidateInterviews = sqliteTable(
  'candidate_interviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityCandidateId: integer('opportunity_candidate_id')
      .notNull()
      .references(() => opportunityCandidates.id, { onDelete: 'cascade' }),
    round: integer('round').notNull().default(1),
    mode: text('mode', { enum: INTERVIEW_MODES }).notNull().default('internal_screening'),

    scheduledAt: text('scheduled_at'),
    heldAt: text('held_at'),
    /** Null while the round is only scheduled — that is how "upcoming" is found. */
    outcome: text('outcome', { enum: INTERVIEW_OUTCOMES }),

    feedback: text('feedback'),
    recommendation: text('recommendation'),
    /**
     * What the panel actually asked. Captured as its own field rather than
     * buried in feedback so it can eventually be set against the question sets
     * the generator produces — see M31.
     */
    questionsAsked: text('questions_asked'),

    loggedByUserId: integer('logged_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    mappingIdx: index('interview_mapping_idx').on(t.opportunityCandidateId),
    scheduledIdx: index('interview_scheduled_idx').on(t.scheduledAt),
  }),
);

/**
 * Who sat on the panel for one round.
 *
 * `userId` is nullable and, today, always null: no interviewer has a login.
 * It exists anyway because the alternative — adding it once interviewers get
 * accounts — means matching historical free-text names to users by string
 * comparison, exactly the guesswork the attribution backfill already has to
 * do elsewhere. See M31 in the plan.
 */
export const interviewPanel = sqliteTable(
  'interview_panel',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    interviewId: integer('interview_id')
      .notNull()
      .references(() => candidateInterviews.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    designation: text('designation'),
    /** Reserved for M31. Null for every row written today. */
    userId: integer('user_id'),
    ...timestamps,
  },
  (t) => ({
    interviewIdx: index('panel_interview_idx').on(t.interviewId),
  }),
);

/* ── M42: TA assignees ─────────────────────────────────────── */

/**
 * The TAs working a requirement — a set, not a column.
 *
 * Replaces the single `owner_user_id`. Every assignee sees the requirement on
 * their board, is alerted about its applicants, and may map candidates and
 * log rounds. Deliberately no "primary": a primary needs a rule for what only
 * the primary may do, and there is none.
 */
export const opportunityAssignees = sqliteTable(
  'opportunity_assignees',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityId: integer('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),
    userId: integer('user_id').notNull(),
    assignedByUserId: integer('assigned_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    oppIdx: index('assignee_opp_idx').on(t.opportunityId),
    userIdx: index('assignee_user_idx').on(t.userId),
    uniq: uniqueIndex('assignee_uniq').on(t.opportunityId, t.userId),
  }),
);

/* ── M46: Prospects ────────────────────────────────────────── */

/**
 * A company we are talking to that is not yet a client.
 *
 * Until now a prospect was an opportunity with a null client_id and a name
 * typed into it, and onboarding matched siblings by exact string. A row means
 * the name is typed once, picked thereafter, and converted by key.
 */
export const prospects = sqliteTable(
  'prospects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    companyName: text('company_name').notNull(),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactMobile: text('contact_mobile'),
    notes: text('notes'),
    createdByUserId: integer('created_by_user_id'),
    /** Set on conversion; the prospect stays so history still resolves. */
    convertedClientId: integer('converted_client_id').references(() => clients.id),
    /*
     * M66. The single contact above stays readable but is no longer written:
     * contacts live in prospect_contacts, where the migration copied it.
     * `stage` reaching `converted` means "became a lead", not "became a
     * client" — that is still convertedClientId.
     */
    stage: text('stage', { enum: PROSPECT_STAGES }).notNull().default('new'),
    temperature: text('temperature', { enum: TEMPERATURES }).notNull().default('cold'),
    ownerUserId: integer('owner_user_id'),
    source: text('source', { enum: PROSPECT_SOURCES }),
    campaignId: integer('campaign_id').references(() => campaigns.id),
    website: text('website'),
    industry: text('industry'),
    location: text('location'),
    deadReason: text('dead_reason'),
    updatedAt: text('updated_at'),
    ...timestamps,
  },
  (t) => ({
    nameIdx: index('prospect_name_idx').on(t.companyName),
    ownerIdx: index('prospect_owner_idx').on(t.ownerUserId),
    campaignIdx: index('prospect_campaign_idx').on(t.campaignId),
  }),
);

/* ── M66: Leadgen pipeline ─────────────────────────────────── */

export const campaigns = sqliteTable('campaigns', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** Free text: "BFSI, Mumbai, 200+ staff". */
  segment: text('segment'),
  channel: text('channel', { enum: CAMPAIGN_CHANNELS }).notNull().default('mixed'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  status: text('status', { enum: CAMPAIGN_STATUSES }).notNull().default('planned'),
  ownerUserId: integer('owner_user_id'),
  notes: text('notes'),
  createdByUserId: integer('created_by_user_id'),
  ...timestamps,
});

export const prospectContacts = sqliteTable(
  'prospect_contacts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    prospectId: integer('prospect_id')
      .notNull()
      .references(() => prospects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    designation: text('designation'),
    email: text('email'),
    mobile: text('mobile'),
    linkedin: text('linkedin'),
    isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
    ...timestamps,
  },
  (t) => ({
    prospectIdx: index('pcontact_prospect_idx').on(t.prospectId),
  }),
);

/**
 * D4: what a qualified prospect becomes, and what Sales raises requirements
 * from. A lead on an existing client (Q5, account growth) has a client and no
 * prospect. `companyName` is a label copied from whichever it is, like the
 * one on opportunities.
 */
export const leads = sqliteTable(
  'leads',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    prospectId: integer('prospect_id').references(() => prospects.id),
    clientId: integer('client_id').references(() => clients.id),
    companyName: text('company_name').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    temperature: text('temperature', { enum: TEMPERATURES }).notNull().default('warm'),
    bantBudget: integer('bant_budget', { mode: 'boolean' }).notNull().default(false),
    bantAuthority: integer('bant_authority', { mode: 'boolean' }).notNull().default(false),
    bantNeed: integer('bant_need', { mode: 'boolean' }).notNull().default(false),
    bantTimeline: integer('bant_timeline', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: LEAD_STATUSES }).notNull().default('open'),
    leadOwnerUserId: integer('lead_owner_user_id'),
    salesOwnerUserId: integer('sales_owner_user_id'),
    /** Q2: Leadgen may suggest a salesperson; a Sales head decides. */
    suggestedSalesUserId: integer('suggested_sales_user_id'),
    handedOffAt: text('handed_off_at'),
    closedReason: text('closed_reason'),
    createdByUserId: integer('created_by_user_id'),
    updatedAt: text('updated_at'),
    ...timestamps,
  },
  (t) => ({
    prospectIdx: index('lead_prospect_idx').on(t.prospectId),
    statusIdx: index('lead_status_idx').on(t.status),
    leadOwnerIdx: index('lead_lead_owner_idx').on(t.leadOwnerUserId),
    salesOwnerIdx: index('lead_sales_owner_idx').on(t.salesOwnerUserId),
  }),
);

/**
 * KTD2: calls, emails, LinkedIn touches, events, notes and meetings in one
 * table. Belongs to a prospect, a lead, or both (a lead's activity keeps its
 * prospect so the prospect's timeline stays whole).
 */
export const activities = sqliteTable(
  'activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    prospectId: integer('prospect_id').references(() => prospects.id),
    leadId: integer('lead_id').references(() => leads.id),
    campaignId: integer('campaign_id').references(() => campaigns.id),
    contactId: integer('contact_id').references(() => prospectContacts.id, { onDelete: 'set null' }),
    type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
    activityDate: text('activity_date').notNull(),
    outcome: text('outcome', { enum: ACTIVITY_OUTCOMES }),
    notes: text('notes'),
    nextFollowUp: text('next_follow_up'),
    /** Meetings only. */
    attendees: text('attendees'),
    nextStep: text('next_step'),
    byUserId: integer('by_user_id'),
    ...timestamps,
  },
  (t) => ({
    prospectIdx: index('activity_prospect_idx').on(t.prospectId),
    leadIdx: index('activity_lead_idx').on(t.leadId),
    campaignIdx: index('activity_campaign_idx').on(t.campaignId),
    followUpIdx: index('activity_follow_up_idx').on(t.nextFollowUp),
  }),
);

/* ── M10: Users & roles ────────────────────────────────────── */

/**
 * The last four are assignable now but carry no access yet beyond a holding
 * page — see ROLES in lib/auth.ts. Keep the two lists identical.
 */
export const USER_ROLES = [
  'admin',
  'management',
  'ta',
  'leadgen',
  'sales',
  'accounts',
  'resource_manager',
  'interviewer',
  'resource',
] as const;

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    username: text('username').notNull().unique(),
    /** PBKDF2-SHA256, hex encoded. Never a plaintext password. */
    passwordHash: text('password_hash').notNull(),
    passwordSalt: text('password_salt').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull().default('admin'),
    /**
     * A TA who also sees the team roll-up. Deliberately a flag rather than a
     * fourth role: a lead is a working recruiter with the same access and the
     * same commercial restrictions, so the role table stays at three and
     * middleware needs no new rules. It only changes what their dashboard shows.
     */
    isTeamLead: integer('is_team_lead', { mode: 'boolean' }).notNull().default(false),
    /**
     * When this user last opened the applicant queue. A watermark rather than
     * a notifications table with a read/unread lifecycle to maintain — the
     * question being asked is only ever "anything new since I looked?", and
     * one column answers it.
     */
    applicationsSeenAt: text('applications_seen_at'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    /**
     * The sign-in identifier, stored lower-case. Null only on accounts that
     * predate it — those keep signing in by username until Admin adds one.
     */
    email: text('email'),
    /**
     * Incremented by every change that must take effect on the person's next
     * request: deactivation, role, head flag, interviewer duty and email. A
     * session token carries the value it was issued with; a mismatch means the
     * session is out of date and is re-issued with the current state.
     */
    sessionVersion: integer('session_version').notNull().default(0),
    /** An internal account that also sits on interview panels. */
    interviewerDuty: integer('interviewer_duty', { mode: 'boolean' }).notNull().default(false),
    /**
     * Last day the account works, inclusive, as YYYY-MM-DD in India time.
     * Required for outside interviewers; null means no end.
     */
    accessUntil: text('access_until'),
    /** The resource record a Resource account belongs to. */
    resourceId: integer('resource_id').references(() => resources.id),
    /**
     * False for an account invited but not yet given a password — it can sign
     * in with Google only. Its stored hash is random and matches nothing.
     */
    hasPassword: integer('has_password', { mode: 'boolean' }).notNull().default(true),
    /**
     * Set when a password is set or changed. Sessions issued before it are
     * signed out (R21) — unlike a session-version change, which re-issues.
     */
    sessionsRevokedAt: text('sessions_revoked_at'),
    lastSignInAt: text('last_sign_in_at'),
    ...timestamps,
  },
  (t) => ({
    usernameIdx: index('users_username_idx').on(t.username),
    emailUq: uniqueIndex('users_email_uq').on(t.email),
    resourceUq: uniqueIndex('users_resource_uq').on(t.resourceId),
  }),
);

/**
 * One emailed password link. Only a hash of the token is kept, so the table
 * cannot be used to sign in as anyone.
 */
export const passwordLinks = sqliteTable(
  'password_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    cancelledAt: text('cancelled_at'),
    createdByUserId: integer('created_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    userIdx: index('password_links_user_idx').on(t.userId),
  }),
);

export const ACCOUNT_EVENT_KINDS = [
  'account_created',
  'account_updated',
  'account_deactivated',
  'account_reactivated',
  'link_sent',
  'link_failed',
  'password_set',
  'password_changed',
  'sign_in',
  'sign_in_failed',
] as const;

/**
 * The account log. `subjectUserId` is null for a failed sign-in against an
 * address no account has, which is recorded by what was typed instead.
 */
export const accountEvents = sqliteTable(
  'account_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectUserId: integer('subject_user_id'),
    actorUserId: integer('actor_user_id'),
    kind: text('kind', { enum: ACCOUNT_EVENT_KINDS }).notNull(),
    /** 'google' or 'password' for sign-ins; null otherwise. */
    method: text('method'),
    attemptedIdentifier: text('attempted_identifier'),
    /** JSON: before/after values for edits, a reason for failures. */
    detail: text('detail').notNull().default('{}'),
    ...timestamps,
  },
  (t) => ({
    subjectIdx: index('account_events_subject_idx').on(t.subjectUserId),
    createdIdx: index('account_events_created_idx').on(t.createdAt),
  }),
);

/* ── CSV export log ─────────────────────────────────────────── */

export const EXPORT_MODES = ['filtered', 'ticked'] as const;

/**
 * One CSV download. Kept apart from `account_events`, whose subject is always
 * one account: an export is about a list, and Admin reads it as "what data
 * left the platform", not as any one person's account history.
 */
export const exportEvents = sqliteTable(
  'export_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    actorUserId: integer('actor_user_id'),
    /** Denormalised so the log still reads correctly after a rename. */
    actorName: text('actor_name').notNull(),
    /** The list's slug: 'resources', 'candidates', 'pipeline', … */
    list: text('list').notNull(),
    mode: text('mode', { enum: EXPORT_MODES }).notNull(),
    /** JSON array of column keys, in file order. */
    fields: text('fields').notNull(),
    /** JSON object of the filters applied; '{}' for a ticked export. */
    filters: text('filters').notNull().default('{}'),
    rowCount: integer('row_count').notNull(),
    ...timestamps,
  },
  (t) => ({
    createdIdx: index('export_events_created_idx').on(t.createdAt),
  }),
);

/* ── M13: Referrals from the public share link ─────────────── */

export const REFERRAL_STATUSES = ['new', 'accepted', 'dismissed'] as const;

/**
 * Where an inbound profile came from. Both land in the same inbox and get the
 * same review before reaching the candidate pool — an application is simply a
 * referral where the referrer and the candidate are the same person.
 */
export const REFERRAL_KINDS = ['referral', 'application'] as const;

/** How far the reviewer got when they picked up the phone. */
export const CONTACT_STATUSES = [
  'not_contacted',
  'attempted',
  'reached',
  'unreachable',
] as const;

/**
 * A candidate recommendation submitted through the public share link.
 *
 * Deliberately a staging inbox rather than a direct write into `candidates`:
 * that endpoint is unauthenticated and the link is forwardable, so anything
 * it wrote straight into the candidate pool would be unreviewed. Accepting a
 * referral is an explicit action that creates the real candidate row.
 */
export const referrals = sqliteTable(
  'referrals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    opportunityId: integer('opportunity_id')
      .notNull()
      .references(() => opportunities.id, { onDelete: 'cascade' }),

    referrerName: text('referrer_name').notNull(),
    referrerEmail: text('referrer_email'),
    referrerMobile: text('referrer_mobile'),

    candidateName: text('candidate_name').notNull(),
    candidateEmail: text('candidate_email'),
    candidateMobile: text('candidate_mobile'),

    experienceYears: real('experience_years'),
    noticePeriodDays: integer('notice_period_days'),
    currentCtc: real('current_ctc'),
    expectedCtc: real('expected_ctc'),
    notes: text('notes'),

    kind: text('kind', { enum: REFERRAL_KINDS }).notNull().default('referral'),
    status: text('status', { enum: REFERRAL_STATUSES }).notNull().default('new'),
    /** Set when accepted into the candidate pool. */
    convertedCandidateId: integer('converted_candidate_id').references(() => candidates.id),
    /** Who accepted or dismissed it. */
    decidedByUserId: integer('decided_by_user_id'),
    /**
     * The employee who referred this applicant, once someone internal confirms
     * the match. The public form takes a typed name — offering a searchable
     * staff list there would hand out the employee directory.
     */
    referredByResourceId: integer('referred_by_resource_id').references(() => resources.id),

    /* ── M26: the call that happens before a decision ──────── */
    /**
     * Approve/dismiss is binary; ringing somebody is not. Without this, two
     * recruiters call the same applicant and "tried twice, no answer" lives
     * in one person's head. Deliberately separate from `status`: having
     * spoken to someone is not the same as admitting them to the pool.
     */
    contactStatus: text('contact_status', { enum: CONTACT_STATUSES })
      .notNull()
      .default('not_contacted'),
    contactNote: text('contact_note'),
    lastContactedAt: text('last_contacted_at'),
    contactedByUserId: integer('contacted_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    opportunityIdx: index('referral_opportunity_idx').on(t.opportunityId),
    statusIdx: index('referral_status_idx').on(t.status),
    kindIdx: index('referral_kind_idx').on(t.kind),
  }),
);

/* ── M19: Agent runs ───────────────────────────────────────── */

export const AGENT_KINDS = [
  'jd_evaluator',
  'budgeting',
  'resume_validation',
  'resume_formatting',
  'interview_questions',
] as const;

export const AGENT_RUN_STATUSES = ['running', 'complete', 'failed'] as const;

/**
 * One invocation of an agent.
 *
 * Recorded rather than fire-and-forget for three reasons: an evaluation about a
 * real person should be re-readable rather than regenerated from memory, the
 * spend needs attributing to whoever incurred it, and reopening a past result
 * costs nothing where re-running costs money.
 *
 * Note what is absent: the resume file itself. Inputs hold what was typed or
 * extracted, never the uploaded document — see the note in lib/agents/run.ts.
 */
export const agentRuns = sqliteTable(
  'agent_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    agent: text('agent', { enum: AGENT_KINDS }).notNull(),
    status: text('status', { enum: AGENT_RUN_STATUSES }).notNull().default('running'),

    /** Who ran it — for attribution of both the judgement and the cost. */
    userId: integer('user_id'),
    userName: text('user_name').notNull(),

    /** Optional links back to the record this was about. */
    opportunityId: integer('opportunity_id').references(() => opportunities.id),
    candidateId: integer('candidate_id').references(() => candidates.id),

    /** A short label so a list of runs is readable at a glance. */
    title: text('title').notNull(),
    /** JSON: the prompt inputs, minus any uploaded file. */
    inputs: text('inputs').notNull().default('{}'),
    /** The model's answer, as markdown. */
    output: text('output'),
    error: text('error'),

    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    /** Estimated USD cost, computed from the token counts at run time. */
    costUsd: real('cost_usd').notNull().default(0),

    ...timestamps,
  },
  (t) => ({
    agentIdx: index('agentrun_agent_idx').on(t.agent),
    opportunityIdx: index('agentrun_opportunity_idx').on(t.opportunityId),
    createdIdx: index('agentrun_created_idx').on(t.createdAt),
  }),
);

/* ── M65: Timesheets ───────────────────────────────────────── */

/**
 * One row per day (v1) or per task (v2) — D11's single table for both.
 *
 * A day is approved or rejected as a whole: the approval routes act on every
 * row of a (deployment, date), so the rows of one day never disagree on
 * status. Billable days are never stored; they are derived from these rows by
 * lib/timesheet-rules.ts whenever they are needed (KTD7).
 */
export const timesheetEntries = sqliteTable(
  'timesheet_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deploymentId: integer('deployment_id')
      .notNull()
      .references(() => deployments.id),
    entryDate: text('entry_date').notNull(),
    entryType: text('entry_type', { enum: ENTRY_TYPES }).notNull().default('work'),
    hours: real('hours').notNull().default(0),
    task: text('task'),
    /** FSD-18 v1.1, D17: null for a normal row; the fixed task otherwise. */
    taskKind: text('task_kind', { enum: TASK_KINDS }),
    status: text('status', { enum: ENTRY_STATUSES }).notNull().default('draft'),
    submittedAt: text('submitted_at'),
    reviewedByUserId: integer('reviewed_by_user_id'),
    reviewedAt: text('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    createdByUserId: integer('created_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    deploymentDateIdx: index('ts_deployment_date_idx').on(t.deploymentId, t.entryDate),
    statusIdx: index('ts_status_idx').on(t.status),
  }),
);

/**
 * G-RES-03. A null client is a company-wide holiday. There is no location
 * column because nothing else in the app records a location yet (Q4).
 */
export const holidays = sqliteTable(
  'holidays',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id').references(() => clients.id),
    holidayDate: text('holiday_date').notNull(),
    name: text('name').notNull(),
    ...timestamps,
  },
  (t) => ({
    dateIdx: index('holiday_date_idx').on(t.holidayDate),
  }),
);

/**
 * FSD-21. A request for leave, by the resource, for the Resource Manager to
 * approve. Per resource, not per deployment: leave is a person's absence.
 * Days are never stored — they are counted from these dates and the holiday
 * calendar (lib/leave-rules.ts). Only an approved request reaches an invoice.
 */
export const leaveRequests = sqliteTable(
  'leave_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    halfDay: integer('half_day', { mode: 'boolean' }).notNull().default(false),
    leaveType: text('leave_type', { enum: LEAVE_TYPES }).notNull().default('paid'),
    reason: text('reason'),
    status: text('status', { enum: LEAVE_STATUSES }).notNull().default('pending'),
    reviewedByUserId: integer('reviewed_by_user_id'),
    reviewedAt: text('reviewed_at'),
    rejectionReason: text('rejection_reason'),
    createdByUserId: integer('created_by_user_id'),
    ...timestamps,
  },
  (t) => ({
    resourceIdx: index('leave_resource_idx').on(t.resourceId, t.startDate),
    statusIdx: index('leave_status_idx').on(t.status),
  }),
);

/* ── M67: Skill matrix and monthly reviews ─────────────────── */

/**
 * G-RM-02. The skill catalogue the matrix is scored against. A list rather
 * than free text so "React", "react" and "ReactJS " stop being three skills;
 * the name is unique case-insensitively (the DDL index is on lower(name)).
 * Retired, never deleted: levels already recorded against one stay readable.
 */
export const skills = sqliteTable('skills', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdByUserId: integer('created_by_user_id'),
  ...timestamps,
});

/** One proficiency level (1–5) per resource per skill. */
export const resourceSkills = sqliteTable(
  'resource_skills',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id),
    skillId: integer('skill_id')
      .notNull()
      .references(() => skills.id),
    level: integer('level').notNull(),
    note: text('note'),
    assessedByUserId: integer('assessed_by_user_id'),
    assessedAt: text('assessed_at'),
    ...timestamps,
  },
  (t) => ({
    pairUq: uniqueIndex('resource_skill_uq').on(t.resourceId, t.skillId),
    skillIdx: index('resource_skill_skill_idx').on(t.skillId),
  }),
);

/**
 * Q4/Q7. What a performance review is scored on. A managed list, like
 * rating_criteria: retiring one stops it being asked, and past scores against
 * it stay readable.
 */
export const reviewCriteria = sqliteTable('review_criteria', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  ...timestamps,
});

/**
 * G-RM-05. One per deployment per month. Keyed on the deployment rather than
 * the resource: a resource on two clients is reviewed by each engagement
 * separately, and each client's feedback is about its own one. resource_id
 * and client_id are copied in so trends and the account view need no joins
 * through a deployment that may later be edited.
 *
 * Client feedback (D13) is recorded here by the Resource Manager on the
 * client's behalf: what was said, by whom, and when.
 */
export const performanceReviews = sqliteTable(
  'performance_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    deploymentId: integer('deployment_id')
      .notNull()
      .references(() => deployments.id),
    resourceId: integer('resource_id')
      .notNull()
      .references(() => resources.id),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id),
    /** YYYY-MM */
    period: text('period').notNull(),
    status: text('status', { enum: REVIEW_STATUSES }).notNull().default('draft'),
    summary: text('summary'),
    strengths: text('strengths'),
    improvements: text('improvements'),
    clientFeedback: text('client_feedback'),
    clientFeedbackBy: text('client_feedback_by'),
    clientFeedbackDate: text('client_feedback_date'),
    submittedAt: text('submitted_at'),
    submittedByUserId: integer('submitted_by_user_id'),
    approvedAt: text('approved_at'),
    approvedByUserId: integer('approved_by_user_id'),
    /** Why Admin sent it back. Cleared when it is submitted again. */
    returnedReason: text('returned_reason'),
    createdByUserId: integer('created_by_user_id'),
    updatedAt: text('updated_at'),
    ...timestamps,
  },
  (t) => ({
    deploymentPeriodUq: uniqueIndex('perf_review_dep_period_uq').on(t.deploymentId, t.period),
    resourceIdx: index('perf_review_resource_idx').on(t.resourceId),
    periodIdx: index('perf_review_period_idx').on(t.period),
  }),
);

/** One score per criterion per review. The average is derived, never stored. */
export const performanceReviewScores = sqliteTable(
  'performance_review_scores',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => performanceReviews.id, { onDelete: 'cascade' }),
    criterionId: integer('criterion_id')
      .notNull()
      .references(() => reviewCriteria.id),
    score: integer('score').notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => ({
    reviewCriterionUq: uniqueIndex('perf_score_uq').on(t.reviewId, t.criterionId),
  }),
);

/**
 * Criteria a team head adds to a single review, scored like the standard ones
 * and counted in its average. They live on the review rather than in
 * review_criteria, which is what keeps them to one resource and one month.
 * The score may be empty on a draft; it is required to submit. The label is
 * unique per review case-insensitively (the DDL index is on lower(label)).
 */
export const performanceReviewExtraScores = sqliteTable('performance_review_extra_scores', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  reviewId: integer('review_id')
    .notNull()
    .references(() => performanceReviews.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  description: text('description'),
  score: integer('score'),
  note: text('note'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

/** G-RM-05. One per client per month. */
export const accountReviews = sqliteTable(
  'account_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id),
    /** YYYY-MM */
    period: text('period').notNull(),
    status: text('status', { enum: REVIEW_STATUSES }).notNull().default('draft'),
    rating: text('rating', { enum: ACCOUNT_RATINGS }),
    summary: text('summary'),
    risks: text('risks'),
    opportunities: text('opportunities'),
    actions: text('actions'),
    submittedAt: text('submitted_at'),
    submittedByUserId: integer('submitted_by_user_id'),
    approvedAt: text('approved_at'),
    approvedByUserId: integer('approved_by_user_id'),
    returnedReason: text('returned_reason'),
    createdByUserId: integer('created_by_user_id'),
    updatedAt: text('updated_at'),
    ...timestamps,
  },
  (t) => ({
    clientPeriodUq: uniqueIndex('account_review_client_period_uq').on(t.clientId, t.period),
    periodIdx: index('account_review_period_idx').on(t.period),
  }),
);

/**
 * A review's locked history. Every submit writes the next version: a JSON
 * snapshot of what the review said (criterion labels, not ids, so later
 * renames do not rewrite it), who locked it, when, and from the second
 * version on the note saying what changed. Never updated or deleted.
 */
export const performanceReviewVersions = sqliteTable(
  'performance_review_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => performanceReviews.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: text('snapshot').notNull(),
    lockedByUserId: integer('locked_by_user_id'),
    lockedAt: text('locked_at').notNull(),
    changeNote: text('change_note'),
    ...timestamps,
  },
  (t) => ({ reviewVersionUq: uniqueIndex('perf_version_uq').on(t.reviewId, t.version) }),
);

export const accountReviewVersions = sqliteTable(
  'account_review_versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reviewId: integer('review_id')
      .notNull()
      .references(() => accountReviews.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: text('snapshot').notNull(),
    lockedByUserId: integer('locked_by_user_id'),
    lockedAt: text('locked_at').notNull(),
    changeNote: text('change_note'),
    ...timestamps,
  },
  (t) => ({ reviewVersionUq: uniqueIndex('account_version_uq').on(t.reviewId, t.version) }),
);

/* ── Relations ─────────────────────────────────────────────── */

export const referralsRelations = relations(referrals, ({ one }) => ({
  opportunity: one(opportunities, {
    fields: [referrals.opportunityId],
    references: [opportunities.id],
  }),
  convertedCandidate: one(candidates, {
    fields: [referrals.convertedCandidateId],
    references: [candidates.id],
  }),
}));

export const clientsRelations = relations(clients, ({ many }) => ({
  projects: many(projects),
  opportunities: many(opportunities),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  client: one(clients, {
    fields: [opportunities.clientId],
    references: [clients.id],
  }),
  candidates: many(opportunityCandidates),
  comments: many(opportunityComments),
  stageHistory: many(opportunityStageHistory),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  resource: one(resources, {
    fields: [candidates.resourceId],
    references: [resources.id],
  }),
  opportunities: many(opportunityCandidates),
}));

export const opportunityCandidatesRelations = relations(
  opportunityCandidates,
  ({ one }) => ({
    opportunity: one(opportunities, {
      fields: [opportunityCandidates.opportunityId],
      references: [opportunities.id],
    }),
    candidate: one(candidates, {
      fields: [opportunityCandidates.candidateId],
      references: [candidates.id],
    }),
  }),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, { fields: [projects.clientId], references: [clients.id] }),
  deployments: many(deployments),
  agreements: many(agreements),
  invoices: many(invoices),
}));

export const resourcesRelations = relations(resources, ({ many }) => ({
  deployments: many(deployments),
  agreementResources: many(agreementResources),
}));

export const deploymentsRelations = relations(deployments, ({ one }) => ({
  resource: one(resources, {
    fields: [deployments.resourceId],
    references: [resources.id],
  }),
  project: one(projects, {
    fields: [deployments.projectId],
    references: [projects.id],
  }),
  agreement: one(agreements, {
    fields: [deployments.agreementId],
    references: [agreements.id],
  }),
}));

export const agreementsRelations = relations(agreements, ({ one, many }) => ({
  project: one(projects, {
    fields: [agreements.projectId],
    references: [projects.id],
  }),
  resources: many(agreementResources),
  invoices: many(invoices),
}));

export const agreementResourcesRelations = relations(agreementResources, ({ one }) => ({
  agreement: one(agreements, {
    fields: [agreementResources.agreementId],
    references: [agreements.id],
  }),
  resource: one(resources, {
    fields: [agreementResources.resourceId],
    references: [resources.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  project: one(projects, { fields: [invoices.projectId], references: [projects.id] }),
  agreement: one(agreements, {
    fields: [invoices.agreementId],
    references: [agreements.id],
  }),
  resources: many(invoiceResources),
}));

export const invoiceResourcesRelations = relations(invoiceResources, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceResources.invoiceId],
    references: [invoices.id],
  }),
  resource: one(resources, {
    fields: [invoiceResources.resourceId],
    references: [resources.id],
  }),
}));

/* ── Inferred types ────────────────────────────────────────── */

export type Resource = typeof resources.$inferSelect;
export type NewResource = typeof resources.$inferInsert;
export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
export type Agreement = typeof agreements.$inferSelect;
export type NewAgreement = typeof agreements.$inferInsert;
export type AgreementResource = typeof agreementResources.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type TimesheetEntry = typeof timesheetEntries.$inferSelect;
export type Holiday = typeof holidays.$inferSelect;
export type Prospect = typeof prospects.$inferSelect;
export type ProspectContact = typeof prospectContacts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type OpportunityCandidate = typeof opportunityCandidates.$inferSelect;
export type CandidateInterview = typeof candidateInterviews.$inferSelect;
export type InterviewPanelMember = typeof interviewPanel.$inferSelect;
export type OpportunityComment = typeof opportunityComments.$inferSelect;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/* ── M62: Integration API ──────────────────────────────────── */

export const INTEGRATION_SCOPES = ['read', 'read-write'] as const;

/** One key per calling application. Only the SHA-256 of the key is stored. */
export const integrationKeys = sqliteTable('integration_keys', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scope: text('scope', { enum: INTEGRATION_SCOPES }).notNull().default('read'),
  lastUsedAt: text('last_used_at'),
  revokedAt: text('revoked_at'),
  ...timestamps,
});

/** Every call the integration API answers, for Admin and Accounts to read. */
export const integrationLog = sqliteTable(
  'integration_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    keyId: integer('key_id'),
    method: text('method').notNull(),
    path: text('path').notNull(),
    status: integer('status').notNull(),
    note: text('note'),
    ...timestamps,
  },
  (t) => ({
    createdIdx: index('intlog_created_idx').on(t.createdAt),
  }),
);

/**
 * A payment against an invoice. Never edited or deleted: a mistaken receipt
 * is reversed by a counter-entry, so the table is a ledger.
 */
export const invoiceReceipts = sqliteTable(
  'invoice_receipts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => invoices.id),
    /** The caller's own ID; unique so a retried push never doubles a payment. */
    externalId: text('external_id'),
    receivedDate: text('received_date').notNull(),
    amount: real('amount').notNull(),
    tdsDeducted: real('tds_deducted').notNull().default(0),
    note: text('note'),
    source: text('source').notNull().default('integration'),
    keyId: integer('key_id'),
    ...timestamps,
  },
  (t) => ({
    invoiceIdx: index('rcpt_invoice_idx').on(t.invoiceId),
    externalIdx: uniqueIndex('rcpt_external_idx').on(t.externalId),
  }),
);
