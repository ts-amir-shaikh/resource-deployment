'use client';

export type ApiError = {
  message: string;
  fields?: Record<string, string>;
  status: number;
  headroom?: number;
  /** Set by the agreement-correction route when invoices already exist. */
  requiresAcknowledgement?: boolean;
  invoiceCount?: number;
  /** M66: a 409 from a company create — near-identical names already on file. */
  duplicates?: unknown[];
};

/** Throws ApiError on non-2xx so callers can render field-level messages. */
export async function api<T = unknown>(
  url: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...rest.headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;

  if (!res.ok) {
    // The server's account check (handle() in lib/api.ts) refused a session
    // that no longer matches the account. A changed role or password: reload,
    // which sends the page through the refresh route for a current session.
    // An ended account: go to sign-in. Either way the screen must not carry on
    // as if the call merely failed.
    if (res.status === 401 && typeof window !== 'undefined') {
      if (payload?.sessionChanged) window.location.reload();
      else if (payload?.signedOut) window.location.assign('/login');
    }
    const err: ApiError = {
      message: payload?.error ?? `Request failed (${res.status})`,
      fields: payload?.fields,
      headroom: payload?.headroom,
      requiresAcknowledgement: payload?.requiresAcknowledgement,
      invoiceCount: payload?.invoiceCount,
      duplicates: payload?.duplicates,
      status: res.status,
    };
    throw err;
  }

  return payload as T;
}

export function isApiError(e: unknown): e is ApiError {
  return typeof e === 'object' && e !== null && 'message' in e && 'status' in e;
}

export function errorMessage(e: unknown): string {
  if (isApiError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong';
}
