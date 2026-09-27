import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { headers } from 'next/headers';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { AllocationError } from './queries';
import { getSessionState, SIGNED_IN_HEADER } from './session';

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Flattens Zod issues into { field: message } for inline form display. */
export function fieldErrors(err: ZodError) {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * Returns the schema's OUTPUT type, so defaults and transforms are reflected
 * (e.g. `.default([])` yields a required array, not `T[] | undefined`).
 */
export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<
  { data: output<S>; error?: never } | { data?: never; error: NextResponse }
> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: fail('Request body must be valid JSON') };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    return {
      error: fail('Please correct the highlighted fields', 422, {
        fields: fieldErrors(result.error),
      }),
    };
  }
  return { data: result.data };
}

/**
 * Wraps a handler so known domain errors become clean HTTP responses.
 *
 * It is also the API's account check. Middleware marks every signed-in request
 * (and strips the marker from anything arriving from outside); for those,
 * the account must still be current before the handler runs. A stale session
 * on a usable account answers "session changed" so the screen reloads and
 * picks up the fresh one; an ended account answers "signed out". Public routes
 * carry no marker and are untouched. `tests/chokepoints.test.ts` fails the
 * build if a signed-in route stops going through here.
 */
export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  if (headers().get(SIGNED_IN_HEADER)) {
    const state = await getSessionState();
    if (state.verdict === 'refresh') {
      return fail('Your access changed. Reload the page to continue.', 401, { sessionChanged: true });
    }
    if (state.verdict !== 'ok') {
      return fail('You have been signed out.', 401, { signedOut: true });
    }
  }
  try {
    return await fn();
  } catch (err) {
    // A redirect from inside a handler is control flow, not a failure.
    if (isRedirectError(err)) throw err;
    if (err instanceof AllocationError) {
      return fail(err.message, 409, {
        headroom: err.headroom,
        requested: err.requested,
      });
    }
    if (err instanceof ZodError) {
      return fail('Please correct the highlighted fields', 422, {
        fields: fieldErrors(err),
      });
    }
    const message = err instanceof Error ? err.message : 'Something went wrong';

    // SQLite constraint violations surface as opaque strings; translate the
    // two we can actually hit into something a user can act on.
    if (message.includes('UNIQUE constraint failed: resources.email')) {
      return fail('A resource with this email already exists', 409, {
        fields: { email: 'This email is already registered' },
      });
    }
    if (message.includes('FOREIGN KEY constraint failed')) {
      return fail('This record is referenced by other data and cannot be changed', 409);
    }

    console.error('[api]', err);
    return fail(message, 500);
  }
}

export function parseId(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
