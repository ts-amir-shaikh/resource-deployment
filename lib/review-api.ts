import 'server-only';
import { fail } from './api';
import { ReviewError } from './reviews';
import { isPeriod, periodOf } from './review-rules';
import { today } from './utils';

/** Runs a handler body, turning a ReviewError into its response; anything else goes on to handle(). */
export async function reviewed(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ReviewError) return fail(err.message, err.status);
    throw err;
  }
}

/** `?period=YYYY-MM`, defaulting to this month. Null when it is present but malformed. */
export function periodParam(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return periodOf(today());
  return isPeriod(value) ? value : null;
}
