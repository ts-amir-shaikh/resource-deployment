/**
 * Structured one-line JSON logs for the reporting boundary. These lines are
 * how denied requests are observed (the Edge gate has no database), so the
 * shape is stable: an `event` code plus small scalar fields.
 *
 * Never pass a token, an Authorization header, a cookie or a response body.
 * Only a token *id* (a label chosen by the operator) may identify a caller,
 * and `logEvent` drops any field whose name suggests a secret as a backstop.
 */

const FORBIDDEN = /token(?!id)|authorization|cookie|secret|password|sha256|hash/i;

export type LogFields = Record<string, string | number | boolean | null | undefined>;

export function logEvent(level: 'info' | 'warn' | 'error', event: string, fields: LogFields = {}): void {
  const safe: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k !== 'tokenId' && FORBIDDEN.test(k)) continue;
    safe[k] = v;
  }
  const line = JSON.stringify({ event, ts: new Date().toISOString(), ...safe });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
