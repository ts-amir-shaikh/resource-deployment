import 'server-only';
import { fail, parseId } from './api';
import { LeadgenError } from './leadgen';

/**
 * Route glue for /api/leadgen. A LeadgenError becomes its own status (with
 * the duplicate list on a 409, so the form can show the warning); anything
 * else is rethrown for handle() to deal with as usual.
 */
export function leadgenFailure(err: unknown) {
  if (err instanceof LeadgenError) return fail(err.message, err.status, err.extra);
  throw err;
}

/** Runs a handler body, turning a LeadgenError into its response. */
export async function leadgen(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    return leadgenFailure(err);
  }
}

/** Positive integer from a query-string value, or undefined. */
export function idParam(value: string | null): number | undefined {
  return value ? (parseId(value) ?? undefined) : undefined;
}
