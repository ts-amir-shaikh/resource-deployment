'use client';

export type ApiError = {
  message: string;
  fields?: Record<string, string>;
  status: number;
  headroom?: number;
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
    const err: ApiError = {
      message: payload?.error ?? `Request failed (${res.status})`,
      fields: payload?.fields,
      headroom: payload?.headroom,
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
