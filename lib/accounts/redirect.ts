/**
 * Where to send someone after sign-in, from a `next` value that arrived in a
 * URL and so cannot be trusted. Only a path on this site survives.
 *
 * A prefix test ("starts with / but not //") is not enough: browsers and the
 * URL parser read `/\evil.com` as `//evil.com`, and strip tabs and newlines,
 * so `/\t/evil.com` escapes too. Resolving against a fixed origin and
 * checking the origin did not change catches every such form.
 */
const PROBE = 'http://same-site.invalid';

export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null;
  let url: URL;
  try {
    url = new URL(raw, PROBE);
  } catch {
    return null;
  }
  if (url.origin !== PROBE) return null;
  return url.pathname + url.search;
}

/** The path part of a safe `next`, for the access check. */
export function pathOf(next: string): string {
  return next.split('?')[0];
}
