import { z } from 'zod';
import { addDaysIso, daysBetweenIso, isRealIsoDate } from './dates';

/**
 * Query-parameter schemas. Every schema is `.strict()`: an unknown key is a
 * 422, not silently ignored, so a typo cannot widen a query. Values arrive as
 * strings and are checked as strings first — `z.coerce.number()` would turn an
 * empty string into 0 (CLAUDE.md, Zod rule).
 */

const int = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,9}$/, 'Must be a whole number')
    .transform(Number)
    .refine((n) => n >= min && n <= max, `Must be between ${min} and ${max}`);

const isoDate = z.string().refine(isRealIsoDate, 'Use a valid date (YYYY-MM-DD)');

const currency = z.enum(['INR', 'AED', 'USD']);

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const MAX_LIMIT = 500;
export const DEFAULT_LIMIT = 100;
/** Longest from→to window accepted on the invoices endpoint (24 months). */
export const MAX_INVOICE_WINDOW_DAYS = 731;

const paging = {
  limit: int(1, MAX_LIMIT).default(String(DEFAULT_LIMIT)),
  offset: int(0, 1_000_000).default('0'),
};

const clientId = int(1, 2_147_483_647);

export const billingParams = z
  .object({
    currency: currency.optional(),
    client_id: clientId.optional(),
    ...paging,
  })
  .strict();

export const invoicesParams = z
  .object({
    as_of: isoDate.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    client_id: clientId.optional(),
    currency: currency.optional(),
    ...paging,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.from && v.to) {
      if (v.to < v.from) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: '"to" cannot be before "from"' });
      } else if (daysBetweenIso(v.from, v.to) > MAX_INVOICE_WINDOW_DAYS) {
        ctx.addIssue({ code: 'custom', path: ['to'], message: 'The window cannot exceed 24 months' });
      }
    }
  });

export const capacityParams = z
  .object({
    min_free: int(0, 100).default('1'),
    ...paging,
  })
  .strict();

export const OPPORTUNITY_STAGE_VALUES = [
  'requirement',
  'qualification',
  'budgeting',
  'candidate_mapping',
  'interview',
  'agreement',
  'won',
  'lost',
  'hold',
] as const;

export const pipelineParams = z
  .object({
    client_id: clientId.optional(),
    stage: z.enum(['open', ...OPPORTUNITY_STAGE_VALUES]).optional(),
    include_terminal: bool.default('false'),
    ...paging,
  })
  .strict();

export const renewalsParams = z
  .object({
    window_days: int(1, 365).default('90'),
    lapsed_within_days: int(0, 365).default('90'),
    client_id: clientId.optional(),
    ...paging,
  })
  .strict();

/**
 * Query string → plain object. A repeated key is rejected rather than
 * resolved by "first wins", which different layers would resolve differently.
 */
export function queryToObject(search: URLSearchParams): { value: Record<string, string>; duplicate?: string } {
  const value: Record<string, string> = {};
  for (const [k, v] of search) {
    if (k in value) return { value, duplicate: k };
    value[k] = v;
  }
  return { value };
}

export function zodDetails(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || (issue.code === 'unrecognized_keys' ? 'query' : '_');
    if (!out[key]) {
      out[key] =
        issue.code === 'unrecognized_keys'
          ? `Unknown parameter: ${issue.keys.join(', ')}`
          : issue.message;
    }
  }
  return out;
}

export { addDaysIso };
