import { REPORTING_SCOPES, type ReportingScope } from './paths';
import { isRealIsoDate } from './dates';

/**
 * Bearer-token verification for the reporting API. Edge-safe: Web Crypto only,
 * no database. The environment holds SHA-256 hashes, never tokens:
 *
 *   REPORTING_TOKENS=[{"id":"gpt-sales-2026-11","sha256":"<64 hex>",
 *                      "scopes":["billing","invoices"],"expires":"2027-02-21"}]
 *
 * The same function runs twice per request — in the middleware gate and again
 * in the route handler — so a removed or edited gate does not open the routes.
 *
 * Everything fails closed: a missing or malformed configuration authenticates
 * nobody.
 */

export type TokenEntry = {
  id: string;
  sha256: string;
  scopes: ReportingScope[];
  /** Last day (inclusive, Asia/Kolkata) the token is accepted. */
  expires: string;
};

export type TokenConfig = { ok: true; entries: TokenEntry[] } | { ok: false; reason: string };

export type VerifyFailure =
  | 'no_header'
  | 'bad_scheme'
  | 'bad_format'
  | 'unknown_token'
  | 'expired'
  | 'config_missing'
  | 'config_invalid';

export type VerifyResult =
  | { ok: true; tokenId: string; scopes: ReportingScope[] }
  | { ok: false; reason: VerifyFailure; detail?: string };

/** `rpt_` + 32 random bytes in base64url (43 characters). */
export const TOKEN_PATTERN = /^rpt_[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export function parseTokenConfig(raw: string | undefined): TokenConfig {
  if (raw === undefined || raw.trim() === '') return { ok: false, reason: 'REPORTING_TOKENS is not set' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'REPORTING_TOKENS is not valid JSON' };
  }
  if (!Array.isArray(parsed)) return { ok: false, reason: 'REPORTING_TOKENS must be a JSON array' };

  const entries: TokenEntry[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null) return { ok: false, reason: 'A token entry is not an object' };
    const e = item as Record<string, unknown>;
    if (typeof e.id !== 'string' || !ID_PATTERN.test(e.id)) return { ok: false, reason: 'A token entry has an invalid id' };
    if (typeof e.sha256 !== 'string' || !HASH_PATTERN.test(e.sha256)) {
      return { ok: false, reason: `Token ${e.id} has an invalid sha256 (64 lowercase hex characters)` };
    }
    if (!Array.isArray(e.scopes) || e.scopes.length === 0) return { ok: false, reason: `Token ${e.id} has no scopes` };
    const scopes: ReportingScope[] = [];
    for (const s of e.scopes) {
      if (typeof s !== 'string' || !(REPORTING_SCOPES as readonly string[]).includes(s)) {
        return { ok: false, reason: `Token ${e.id} has an unknown scope` };
      }
      scopes.push(s as ReportingScope);
    }
    if (typeof e.expires !== 'string' || !isRealIsoDate(e.expires)) {
      return { ok: false, reason: `Token ${e.id} needs an expires date (YYYY-MM-DD)` };
    }
    if (ids.has(e.id)) return { ok: false, reason: `Duplicate token id ${e.id}` };
    if (hashes.has(e.sha256)) return { ok: false, reason: `Duplicate token hash on ${e.id}` };
    ids.add(e.id);
    hashes.add(e.sha256);
    entries.push({ id: e.id, sha256: e.sha256, scopes, expires: e.expires });
  }
  return { ok: true, entries };
}

let cachedRaw: string | undefined;
let cachedConfig: TokenConfig | undefined;

function configFor(raw: string | undefined): TokenConfig {
  if (cachedConfig && cachedRaw === raw) return cachedConfig;
  cachedRaw = raw;
  cachedConfig = parseTokenConfig(raw);
  return cachedConfig;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compares two equal-purpose strings without exiting at the first difference. */
export function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/**
 * @param authorization  the Authorization header, or null
 * @param rawConfig      the REPORTING_TOKENS value
 * @param today          today's Asia/Kolkata date (YYYY-MM-DD)
 */
export async function verifyBearer(
  authorization: string | null,
  rawConfig: string | undefined,
  today: string,
): Promise<VerifyResult> {
  const config = configFor(rawConfig);
  if (!config.ok) {
    return { ok: false, reason: rawConfig === undefined || rawConfig.trim() === '' ? 'config_missing' : 'config_invalid', detail: config.reason };
  }
  if (authorization === null || authorization === '') return { ok: false, reason: 'no_header' };
  const m = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!m) return { ok: false, reason: 'bad_scheme' };
  const token = m[1];
  if (!TOKEN_PATTERN.test(token)) return { ok: false, reason: 'bad_format' };

  const presented = await sha256Hex(token);
  // Compare against every entry, with no early exit, so timing does not say
  // which entry (if any) matched.
  let match: TokenEntry | null = null;
  for (const entry of config.entries) {
    if (constantTimeEqual(presented, entry.sha256) && match === null) match = entry;
  }
  if (!match) return { ok: false, reason: 'unknown_token' };
  if (today > match.expires) return { ok: false, reason: 'expired' };
  return { ok: true, tokenId: match.id, scopes: match.scopes };
}
