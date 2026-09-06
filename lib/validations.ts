import { z } from 'zod';

const optionalStr = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v));

const optionalEmail = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: 'Enter a valid email address',
  });

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date');

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v === '' ? undefined : v))
  .refine((v) => v === undefined || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'Use a valid date',
  });

const money = z.coerce.number().min(0, 'Cannot be negative');
const optionalMoney = z
  .union([z.coerce.number().min(0), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)));

/* ── Resources ─────────────────────────────────────────────── */

export const resourceSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    email: z.string().trim().email('Enter a valid email address'),
    mobile: optionalStr,
    designation: optionalStr,
    currentCtc: optionalMoney,
    revisedCtc: optionalMoney,
    revisedEffectiveFrom: optionalDate,
    primarySkill: optionalStr,
    secondarySkill: optionalStr,
    otherSkills: z.array(z.string().trim().min(1)).default([]),
  })
  .refine((d) => !(d.revisedCtc !== undefined && !d.revisedEffectiveFrom), {
    message: 'Revised CTC needs an effective-from date',
    path: ['revisedEffectiveFrom'],
  });

/* ── Clients ───────────────────────────────────────────────── */

export const clientSchema = z.object({
  companyName: z.string().trim().min(1, 'Company name is required'),
  spocName: optionalStr,
  spocEmail: optionalEmail,
  spocMobile: optionalStr,
  spocDesignation: optionalStr,
  accountName: optionalStr,
  accountEmail: optionalEmail,
  accountMobile: optionalStr,
  altSpocName: optionalStr,
  altSpocEmail: optionalEmail,
  altSpocMobile: optionalStr,
  altSpocDesignation: optionalStr,
});

/* ── Projects ──────────────────────────────────────────────── */

export const projectSchema = z.object({
  clientId: z.coerce.number().int().positive('Select a client'),
  projectName: z.string().trim().min(1, 'Project name is required'),
  managerName: optionalStr,
  managerEmail: optionalEmail,
  managerMobile: optionalStr,
  managerDesignation: optionalStr,
});

/* ── Deployments ───────────────────────────────────────────── */

export const deploymentSchema = z
  .object({
    resourceId: z.coerce.number().int().positive('Select a resource'),
    projectId: z.coerce.number().int().positive('Select a project'),
    deploymentType: z.enum(['billable', 'shadow']),
    allocationPercentage: z.coerce
      .number()
      .int()
      .min(1, 'Allocation must be at least 1%')
      .max(100, 'Allocation cannot exceed 100%'),
    startDate: dateStr,
    endDate: optionalDate,
    billingAmount: money.default(0),
    commissionAmount: money.default(0),
    gstApplicable: z.coerce.boolean().default(true),
  })
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  .refine((d) => d.deploymentType !== 'billable' || d.billingAmount > 0, {
    message: 'Billable deployments need a billing amount',
    path: ['billingAmount'],
  })
  .refine((d) => d.commissionAmount <= d.billingAmount, {
    message: 'Commission cannot exceed the billing amount',
    path: ['commissionAmount'],
  })
  // Shadow deployments carry no billing; normalise rather than reject.
  .transform((d) =>
    d.deploymentType === 'shadow'
      ? { ...d, billingAmount: 0, commissionAmount: 0, gstApplicable: false }
      : d,
  );

export const endDeploymentSchema = z.object({
  endDate: dateStr,
});

/* ── Agreements ────────────────────────────────────────────── */

const agreementResourceEntry = z.object({
  resourceId: z.coerce.number().int().positive(),
  billingAmount: money.default(0),
});

export const agreementSchema = z
  .object({
    projectId: z.coerce.number().int().positive('Select a project'),
    agreementNumber: optionalStr,
    title: z.string().trim().min(1, 'Title is required'),
    scope: z.enum(['individual', 'team']),
    value: money.refine((v) => v > 0, 'Agreement value is required'),
    startDate: dateStr,
    endDate: dateStr,
    notes: optionalStr,
    resources: z.array(agreementResourceEntry).default([]),
  })
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date cannot be before the start date',
    path: ['endDate'],
  })
  .refine((d) => d.resources.length > 0, {
    message: 'Add at least one resource',
    path: ['resources'],
  })
  .refine((d) => d.scope !== 'individual' || d.resources.length === 1, {
    message: 'An individual agreement covers exactly one resource',
    path: ['resources'],
  });

/** Renewal reuses the create shape; the parent link comes from the URL. */
export const agreementRenewSchema = agreementSchema;

/** In-place edits are limited to fields that do not alter commercial terms. */
export const agreementEditSchema = z.object({
  agreementNumber: optionalStr,
  title: z.string().trim().min(1, 'Title is required'),
  notes: optionalStr,
});

/* ── Invoices ──────────────────────────────────────────────── */

export const invoiceSchema = z
  .object({
    projectId: z.coerce.number().int().positive('Select a project'),
    agreementId: z
      .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
      .optional()
      .transform((v) => (v === '' || v === null || v === undefined ? undefined : Number(v))),
    invoiceNumber: optionalStr,
    scope: z.enum(['individual', 'team']),
    periodFrom: dateStr,
    periodTo: dateStr,
    amount: money.refine((v) => v > 0, 'Invoice amount is required'),
    gstAmount: money.default(0),
    invoiceDate: optionalDate,
    dueDate: optionalDate,
    notes: optionalStr,
    resourceIds: z.array(z.coerce.number().int().positive()).default([]),
  })
  .refine((d) => d.periodTo >= d.periodFrom, {
    message: 'Period end cannot be before period start',
    path: ['periodTo'],
  })
  .refine((d) => !d.dueDate || !d.invoiceDate || d.dueDate >= d.invoiceDate, {
    message: 'Due date cannot be before the invoice date',
    path: ['dueDate'],
  });

export const invoiceAdvanceSchema = z.object({
  /** Omit to advance exactly one step. */
  targetStatus: z
    .enum(['raised', 'pending_collection', 'collected'])
    .optional(),
});

export const invoiceBulkAdvanceSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one invoice'),
  targetStatus: z.enum(['raised', 'pending_collection', 'collected']),
});

/* ── Opportunities ─────────────────────────────────────────── */

const optionalInt = z
  .union([z.coerce.number().int().min(0), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : Number(v)));

export const opportunitySchema = z
  .object({
    /** Omit for a prospect; the company is then identified by name alone. */
    clientId: z
      .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
      .optional()
      .transform((v) =>
        v === '' || v === null || v === undefined ? undefined : Number(v),
      ),
    companyName: z.string().trim().min(1, 'Company name is required'),
    title: z.string().trim().min(1, 'Title is required'),

    experienceMin: optionalInt,
    experienceMax: optionalInt,
    primarySkill: optionalStr,
    secondarySkill: optionalStr,
    otherSkills: z.array(z.string().trim().min(1)).default([]),

    workMode: z.enum(['onsite', 'hybrid', 'remote']).optional(),
    location: optionalStr,
    timezone: optionalStr,
    engagementType: z.enum(['c2h', 'contract', 'permanent', 'pilot']).optional(),

    requiredCount: z.coerce
      .number()
      .int()
      .min(1, 'At least one position is required')
      .max(999),
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,

    jdContent: optionalStr,
    workingDays: optionalStr,
    workingHours: optionalStr,

    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    owner: optionalStr,
    nextStep: optionalStr,
    nextStepDate: optionalDate,
  })
  .refine(
    (d) =>
      d.experienceMin === undefined ||
      d.experienceMax === undefined ||
      d.experienceMax >= d.experienceMin,
    { message: 'Max experience cannot be below min', path: ['experienceMax'] },
  )
  .refine(
    (d) =>
      d.budgetMin === undefined ||
      d.budgetMax === undefined ||
      d.budgetMax >= d.budgetMin,
    { message: 'Max budget cannot be below min', path: ['budgetMax'] },
  );

export const stageMoveSchema = z
  .object({
    toStage: z.enum([
      'requirement',
      'qualification',
      'budgeting',
      'candidate_mapping',
      'interview',
      'agreement',
      'won',
      'lost',
      'hold',
    ]),
    note: optionalStr,
    /** Required when parking or closing a deal out. */
    closedReason: optionalStr,
  })
  .refine((d) => !['lost', 'hold'].includes(d.toStage) || Boolean(d.closedReason), {
    message: 'A reason is required when marking an opportunity lost or on hold',
    path: ['closedReason'],
  });

export const commentSchema = z
  .object({
    author: z.string().trim().min(1, 'Your name is required'),
    body: z.string().trim().min(1, 'Comment cannot be empty'),
    isFollowup: z.coerce.boolean().default(false),
    followUpDate: optionalDate,
  })
  .refine((d) => !d.isFollowup || Boolean(d.followUpDate), {
    message: 'Pick a date for the follow-up',
    path: ['followUpDate'],
  });

/* ── Candidates ────────────────────────────────────────────── */

export const candidateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    email: optionalEmail,
    mobile: optionalStr,
    currentDesignation: optionalStr,
    experienceYears: z
      .union([z.coerce.number().min(0).max(60), z.literal('')])
      .optional()
      .transform((v) => (v === '' || v === undefined ? undefined : Number(v))),

    primarySkill: optionalStr,
    secondarySkill: optionalStr,
    otherSkills: z.array(z.string().trim().min(1)).default([]),

    currentCtc: optionalMoney,
    expectedCtc: optionalMoney,
    noticePeriodDays: optionalInt,
    location: optionalStr,

    source: z.enum(['in_house', 'partner', 'agency']),
    sourceName: optionalStr,
    resourceId: z
      .union([z.coerce.number().int().positive(), z.literal(''), z.null()])
      .optional()
      .transform((v) =>
        v === '' || v === null || v === undefined ? undefined : Number(v),
      ),
    notes: optionalStr,
  })
  .refine((d) => d.source === 'in_house' || Boolean(d.sourceName), {
    message: 'Name the partner or agency this candidate came from',
    path: ['sourceName'],
  })
  .refine((d) => d.source === 'in_house' || d.resourceId === undefined, {
    message: 'Only in-house candidates can be linked to a bench resource',
    path: ['resourceId'],
  })
  // In-house candidates carry no external source name.
  .transform((d) => (d.source === 'in_house' ? { ...d, sourceName: undefined } : d));

export const candidateMappingSchema = z.object({
  candidateId: z.coerce.number().int().positive('Select a candidate'),
  status: z
    .enum([
      'mapped',
      'screening',
      'submitted',
      'interview',
      'selected',
      'offered',
      'joined',
      'rejected',
      'withdrawn',
    ])
    .default('mapped'),
  interviewRound: z.coerce.number().int().min(0).max(20).default(0),
  interviewDate: optionalDate,
  feedback: optionalStr,
  expectedBilling: optionalMoney,
});

export const candidateMappingUpdateSchema = candidateMappingSchema.omit({
  candidateId: true,
});

export const convertSchema = z.object({
  projectName: z.string().trim().min(1, 'Project name is required'),
  managerName: optionalStr,
  managerEmail: optionalEmail,
  managerMobile: optionalStr,
  managerDesignation: optionalStr,
  /** Only candidates already marked joined are eligible to deploy. */
  createDeployments: z.coerce.boolean().default(true),
});

export type ResourceInput = z.input<typeof resourceSchema>;
export type ClientInput = z.input<typeof clientSchema>;
export type ProjectInput = z.input<typeof projectSchema>;
export type DeploymentInput = z.input<typeof deploymentSchema>;
export type AgreementInput = z.input<typeof agreementSchema>;
export type InvoiceInput = z.input<typeof invoiceSchema>;
