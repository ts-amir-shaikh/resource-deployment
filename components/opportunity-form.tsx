'use client';

/**
 * The requirement form, shared by "Add Opportunity" on the pipeline board and
 * "Edit Requirement" on the detail page.
 *
 * One component rather than two copies: this is twenty-odd fields validated by
 * a single Zod schema, and a second copy would drift the moment a field is
 * added to one screen and forgotten on the other.
 */

import { FormSection, Field } from '@/components/ui';
import { CURRENCY_OPTIONS, formatMoney, opportunityValue } from '@/lib/utils';

export type OpportunityFormValues = {
  clientId: string;
  companyName: string;
  title: string;
  experienceMin: string;
  experienceMax: string;
  primarySkill: string;
  secondarySkill: string;
  otherSkills: string[];
  workMode: string;
  location: string;
  timezone: string;
  engagementType: string;
  requiredCount: string;
  currency: string;
  budgetMin: string;
  budgetMax: string;
  dealValue: string;
  hiringBudgetMin: string;
  hiringBudgetMax: string;
  jdContent: string;
  workingDays: string;
  workingHours: string;
  priority: string;
  owner: string;
  nextStep: string;
  nextStepDate: string;
};

export type ClientOption = { id: number; companyName: string };

export const BLANK_OPPORTUNITY: OpportunityFormValues = {
  clientId: '',
  companyName: '',
  title: '',
  experienceMin: '',
  experienceMax: '',
  primarySkill: '',
  secondarySkill: '',
  otherSkills: [],
  workMode: 'onsite',
  location: '',
  timezone: '',
  engagementType: '',
  requiredCount: '1',
  currency: 'INR',
  budgetMin: '',
  budgetMax: '',
  dealValue: '',
  hiringBudgetMin: '',
  hiringBudgetMax: '',
  jdContent: '',
  workingDays: '',
  workingHours: '',
  priority: 'medium',
  owner: '',
  nextStep: '',
  nextStepDate: '',
};

/** Inputs are strings; null and undefined both become ''. */
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Existing opportunity → form values. */
export function toFormValues(o: {
  clientId: number | null;
  companyName: string;
  title: string;
  experienceMin: number | null;
  experienceMax: number | null;
  primarySkill: string | null;
  secondarySkill: string | null;
  otherSkills?: string | null;
  workMode: string | null;
  location: string | null;
  timezone: string | null;
  engagementType: string | null;
  requiredCount: number;
  currency?: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  dealValue?: number | null;
  hiringBudgetMin: number | null;
  hiringBudgetMax: number | null;
  jdContent?: string | null;
  workingDays?: string | null;
  workingHours?: string | null;
  priority: string | null;
  owner: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
}): OpportunityFormValues {
  let otherSkills: string[] = [];
  try {
    const parsed = o.otherSkills ? JSON.parse(o.otherSkills) : [];
    if (Array.isArray(parsed)) otherSkills = parsed.map(String);
  } catch {
    // A malformed value is not worth failing the whole edit over.
  }

  return {
    clientId: str(o.clientId),
    companyName: o.companyName,
    title: o.title,
    experienceMin: str(o.experienceMin),
    experienceMax: str(o.experienceMax),
    primarySkill: str(o.primarySkill),
    secondarySkill: str(o.secondarySkill),
    otherSkills,
    workMode: o.workMode ?? 'onsite',
    location: str(o.location),
    timezone: str(o.timezone),
    engagementType: str(o.engagementType),
    requiredCount: str(o.requiredCount),
    currency: o.currency ?? 'INR',
    budgetMin: str(o.budgetMin),
    budgetMax: str(o.budgetMax),
    dealValue: str(o.dealValue),
    hiringBudgetMin: str(o.hiringBudgetMin),
    hiringBudgetMax: str(o.hiringBudgetMax),
    jdContent: str(o.jdContent),
    workingDays: str(o.workingDays),
    workingHours: str(o.workingHours),
    priority: o.priority ?? 'medium',
    owner: str(o.owner),
    nextStep: str(o.nextStep),
    nextStepDate: str(o.nextStepDate),
  };
}

/** Form values → request body. */
export function toPayload(form: OpportunityFormValues, clients: ClientOption[]) {
  return {
    ...form,
    // A picked client sets the company name; otherwise it is a prospect.
    companyName:
      form.clientId !== ''
        ? (clients.find((c) => String(c.id) === form.clientId)?.companyName ??
          form.companyName)
        : form.companyName,
    engagementType: form.engagementType === '' ? undefined : form.engagementType,
  };
}

export default function OpportunityFormFields({
  form,
  setForm,
  errors,
  clients,
}: {
  form: OpportunityFormValues;
  setForm: (v: OpportunityFormValues) => void;
  errors: Record<string, string>;
  clients: ClientOption[];
}) {
  // Shown as the placeholder and hint, so it is obvious what leaving the
  // override blank will actually produce.
  const derived = opportunityValue({
    dealValue: null,
    budgetMin: form.budgetMin === '' ? null : Number(form.budgetMin),
    budgetMax: form.budgetMax === '' ? null : Number(form.budgetMax),
    requiredCount: Number(form.requiredCount) || 1,
  });

  return (
    <div className="space-y-5">
      <FormSection title="Company">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Existing Client"
            error={errors.clientId}
            hint="Leave unset if this is a new prospect"
          >
            <select
              className="input"
              value={form.clientId}
              onChange={(e) =>
                setForm({
                  ...form,
                  clientId: e.target.value,
                  companyName:
                    clients.find((c) => String(c.id) === e.target.value)
                      ?.companyName ?? '',
                })
              }
            >
              <option value="">New prospect — not a client yet</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Company Name"
            required
            error={errors.companyName}
            hint={form.clientId ? 'Taken from the selected client' : undefined}
          >
            <input
              className="input"
              value={form.companyName}
              disabled={form.clientId !== ''}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Requirement">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" required error={errors.title} className="sm:col-span-2">
            <input
              className="input"
              placeholder="e.g. FullStack Engineer (Angular + MVC + C#)"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>
          <Field label="Primary Skill" error={errors.primarySkill}>
            <input
              className="input"
              value={form.primarySkill}
              onChange={(e) => setForm({ ...form, primarySkill: e.target.value })}
            />
          </Field>
          <Field label="Secondary Skill" error={errors.secondarySkill}>
            <input
              className="input"
              value={form.secondarySkill}
              onChange={(e) => setForm({ ...form, secondarySkill: e.target.value })}
            />
          </Field>
          <Field label="Experience — Min (yrs)" error={errors.experienceMin}>
            <input
              className="input"
              type="number"
              min={0}
              value={form.experienceMin}
              onChange={(e) => setForm({ ...form, experienceMin: e.target.value })}
            />
          </Field>
          <Field label="Experience — Max (yrs)" error={errors.experienceMax}>
            <input
              className="input"
              type="number"
              min={0}
              value={form.experienceMax}
              onChange={(e) => setForm({ ...form, experienceMax: e.target.value })}
            />
          </Field>
          <Field label="Positions Required" required error={errors.requiredCount}>
            <input
              className="input"
              type="number"
              min={1}
              value={form.requiredCount}
              onChange={(e) => setForm({ ...form, requiredCount: e.target.value })}
            />
          </Field>
          <Field label="Priority">
            <select
              className="input"
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
      </FormSection>

      <FormSection title="Engagement">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Work Mode">
            <div className="flex rounded-md border border-line bg-surface p-0.5">
              {(['onsite', 'hybrid', 'remote'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, workMode: m })}
                  className={`flex-1 rounded px-2 py-1.5 text-sm font-medium capitalize transition-colors ${
                    form.workMode === m
                      ? 'bg-brand text-white'
                      : 'text-ink2 hover:text-ink'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Engagement Type" error={errors.engagementType}>
            <select
              className="input"
              value={form.engagementType}
              onChange={(e) => setForm({ ...form, engagementType: e.target.value })}
            >
              <option value="">Not set</option>
              <option value="c2h">Contract to Hire</option>
              <option value="contract">Contract</option>
              <option value="permanent">Permanent</option>
              <option value="pilot">Pilot</option>
            </select>
          </Field>
          <Field label="Client Location" error={errors.location}>
            <input
              className="input"
              placeholder="e.g. Goregaon, Mumbai"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
          <Field label="Timezone" error={errors.timezone}>
            <input
              className="input"
              placeholder="e.g. USA Timezone"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
          </Field>
          <Field label="Working Days" error={errors.workingDays}>
            <input
              className="input"
              placeholder="e.g. Mon–Fri"
              value={form.workingDays}
              onChange={(e) => setForm({ ...form, workingDays: e.target.value })}
            />
          </Field>
          <Field label="Working Hours" error={errors.workingHours}>
            <input
              className="input"
              placeholder="e.g. 2:00 PM – 11:00 PM IST"
              value={form.workingHours}
              onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Budget & Ownership">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Currency" error={errors.currency}>
            <select
              className="input"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Deal Value (per month)"
            error={errors.dealValue}
            hint={
              derived !== null
                ? `Blank uses budget × positions — ${formatMoney(derived, form.currency)}`
                : 'Blank leaves this requirement unvalued in pipeline totals'
            }
          >
            <input
              className="input"
              type="number"
              min={0}
              placeholder={derived !== null ? String(derived) : ''}
              value={form.dealValue}
              onChange={(e) => setForm({ ...form, dealValue: e.target.value })}
            />
          </Field>
          <Field
            label="Budget Min (₹/month)"
            error={errors.budgetMin}
            hint="Optional — leave blank if not shared"
          >
            <input
              className="input"
              type="number"
              min={0}
              value={form.budgetMin}
              onChange={(e) => setForm({ ...form, budgetMin: e.target.value })}
            />
          </Field>
          <Field label="Budget Max (₹/month)" error={errors.budgetMax}>
            <input
              className="input"
              type="number"
              min={0}
              value={form.budgetMax}
              onChange={(e) => setForm({ ...form, budgetMax: e.target.value })}
            />
          </Field>
          <Field
            label="Hiring Budget Min (₹/month)"
            error={errors.hiringBudgetMin}
            hint="What TA can offer a candidate — shown to the TA team in place of the client budget"
          >
            <input
              className="input"
              type="number"
              min={0}
              value={form.hiringBudgetMin}
              onChange={(e) => setForm({ ...form, hiringBudgetMin: e.target.value })}
            />
          </Field>
          <Field label="Hiring Budget Max (₹/month)" error={errors.hiringBudgetMax}>
            <input
              className="input"
              type="number"
              min={0}
              value={form.hiringBudgetMax}
              onChange={(e) => setForm({ ...form, hiringBudgetMax: e.target.value })}
            />
          </Field>
          <Field label="Owner" error={errors.owner}>
            <input
              className="input"
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </Field>
          <Field label="Next Step Date" error={errors.nextStepDate}>
            <input
              className="input"
              type="date"
              value={form.nextStepDate}
              onChange={(e) => setForm({ ...form, nextStepDate: e.target.value })}
            />
          </Field>
          <Field label="Next Step" error={errors.nextStep} className="sm:col-span-2">
            <input
              className="input"
              placeholder="e.g. Share shortlisted profiles with the panel"
              value={form.nextStep}
              onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Job Description">
        <Field label="JD Content" error={errors.jdContent}>
          <textarea
            className="input min-h-32 resize-y"
            placeholder="Role summary, responsibilities, must-have skills…"
            value={form.jdContent}
            onChange={(e) => setForm({ ...form, jdContent: e.target.value })}
          />
        </Field>
      </FormSection>
    </div>
  );
}
