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

    deploymentType: text('deployment_type', { enum: DEPLOYMENT_TYPES })
      .notNull()
      .default('billable'),
    /** 1-100. Sum across a resource's active deployments must be <= 100. */
    allocationPercentage: integer('allocation_percentage').notNull().default(100),

    startDate: text('start_date').notNull(),
    endDate: text('end_date'),

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

    amount: real('amount').notNull(),
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
    budgetMin: real('budget_min'),
    budgetMax: real('budget_max'),

    jdContent: text('jd_content'),
    workingDays: text('working_days'),
    workingHours: text('working_hours'),

    stage: text('stage', { enum: OPPORTUNITY_STAGES }).notNull().default('requirement'),
    priority: text('priority', { enum: PRIORITIES }).default('medium'),
    owner: text('owner'),

    nextStep: text('next_step'),
    nextStepDate: text('next_step_date'),
    /** Required when moving to lost or hold. */
    closedReason: text('closed_reason'),

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

export const CANDIDATE_SOURCES = ['in_house', 'partner', 'agency'] as const;

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
    ...timestamps,
  },
  (t) => ({
    oppIdx: index('oppstage_opp_idx').on(t.opportunityId),
  }),
);

/* ── Relations ─────────────────────────────────────────────── */

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
