import { sql, relations } from 'drizzle-orm';
import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core';

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
    gstApplicable: integer('gst_applicable', { mode: 'boolean' })
      .default(true)
      .notNull(),

    status: text('status', { enum: DEPLOYMENT_STATUSES })
      .notNull()
      .default('active'),
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
    ...timestamps,
  },
  (t) => ({
    projectIdx: index('inv_project_idx').on(t.projectId),
    agreementIdx: index('inv_agreement_idx').on(t.agreementId),
    statusIdx: index('inv_status_idx').on(t.status),
  }),
);

/** Junction: which resources an invoice line covers. */
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
    owner: text('owner'),
    /** The account that owns this requirement. Null where the name matched none. */
    ownerUserId: integer('owner_user_id'),

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

export const CANDIDATE_SOURCES = ['in_house', 'partner', 'agency', 'referral'] as const;

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
    location: text('location'),

    source: text('source', { enum: CANDIDATE_SOURCES }).notNull().default('in_house'),
    /** Required for partner/agency; null for in-house. */
    sourceName: text('source_name'),

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

/* ── M10: Users & roles ────────────────────────────────────── */

export const USER_ROLES = ['admin', 'management', 'ta'] as const;

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
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    usernameIdx: index('users_username_idx').on(t.username),
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
    ...timestamps,
  },
  (t) => ({
    opportunityIdx: index('referral_opportunity_idx').on(t.opportunityId),
    statusIdx: index('referral_status_idx').on(t.status),
  }),
);

/* ── M19: Agent runs ───────────────────────────────────────── */

export const AGENT_KINDS = [
  'jd_evaluator',
  'budgeting',
  'resume_validation',
  'resume_formatting',
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
export type NewInvoice = typeof invoices.$inferInsert;

export type DeploymentType = (typeof DEPLOYMENT_TYPES)[number];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export type Opportunity = typeof opportunities.$inferSelect;
export type NewOpportunity = typeof opportunities.$inferInsert;
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type OpportunityCandidate = typeof opportunityCandidates.$inferSelect;
export type OpportunityComment = typeof opportunityComments.$inferSelect;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number];
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];
