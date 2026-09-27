import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { normaliseEmail } from './identity';

/**
 * Google sign-in as a plain OpenID Connect authorization-code flow (KTD4):
 * state, nonce and PKCE on the way out; on the way back, the ID token's
 * signature is checked against Google's published keys and its claims against
 * this app. The only thing taken from Google is a verified email address,
 * which must match an existing account exactly (R13). Nothing is created.
 */

const DISCOVERY_URL = 'https://accounts.google.com/.well-known/openid-configuration';
const ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const FLOW_MINUTES = 10;
export const FLOW_COOKIE = 'rd_google_flow';
export const FLOW_PURPOSE = 'google-flow';

export type GoogleConfig = { clientId: string; clientSecret: string; redirectUri: string };

/**
 * Null unless everything is set. The redirect must match the one registered
 * in Google Cloud character for character, so it comes from APP_BASE_URL and
 * never from whatever host a request happened to arrive on.
 */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
  const base = (env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base}/api/auth/google/callback` };
}

export type Flow = { state: string; nonce: string; verifier: string; next: string | null };

export function newFlow(next: string | null): Flow {
  const r = () => randomBytes(32).toString('base64url');
  return { state: r(), nonce: r(), verifier: r(), next };
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function authorizationUrl(endpoint: string, config: GoogleConfig, flow: Flow): string {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: pkceChallenge(flow.verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

export type ClaimCheck = { ok: true; email: string } | { ok: false; reason: string };

/**
 * The claim rules, apart from the signature. `jwtVerify` already enforces
 * issuer, audience and expiry; they are checked again here so the rules are
 * in one place a test can reach, and so nonce and `email_verified` — which
 * `jwtVerify` knows nothing about — can never be skipped.
 */
export function checkIdTokenClaims(
  claims: JWTPayload & Record<string, unknown>,
  expected: { clientId: string; nonce: string; now?: Date },
): ClaimCheck {
  const now = Math.floor((expected.now ?? new Date()).getTime() / 1000);
  if (typeof claims.iss !== 'string' || !ISSUERS.includes(claims.iss)) return { ok: false, reason: 'issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(expected.clientId)) return { ok: false, reason: 'audience' };
  if (typeof claims.exp !== 'number' || claims.exp <= now) return { ok: false, reason: 'expired' };
  if (typeof claims.nonce !== 'string' || claims.nonce !== expected.nonce) return { ok: false, reason: 'nonce' };
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    return { ok: false, reason: 'email_unverified' };
  }
  if (typeof claims.email !== 'string' || !claims.email.includes('@')) return { ok: false, reason: 'no_email' };
  return { ok: true, email: normaliseEmail(claims.email) };
}

/* ── Network: discovery, code exchange, signature check ─────── */

type Discovery = { authorization_endpoint: string; token_endpoint: string; jwks_uri: string };

let discovery: { value: Discovery; at: number } | null = null;
let jwks: { uri: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;

export async function googleDiscovery(): Promise<Discovery> {
  if (discovery && Date.now() - discovery.at < 60 * 60 * 1000) return discovery.value;
  const res = await fetch(DISCOVERY_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Google discovery failed: ${res.status}`);
  const value = (await res.json()) as Discovery;
  discovery = { value, at: Date.now() };
  return value;
}

function keySet(uri: string) {
  // createRemoteJWKSet caches the keys and refetches when Google rotates them.
  if (!jwks || jwks.uri !== uri) jwks = { uri, set: createRemoteJWKSet(new URL(uri)) };
  return jwks.set;
}

/** Trades the one-time code for the ID token and returns its checked email. */
export async function emailFromCallback(config: GoogleConfig, code: string, flow: Flow): Promise<ClaimCheck> {
  const d = await googleDiscovery();
  const res = await fetch(d.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: flow.verifier,
    }),
    cache: 'no-store',
  });
  if (!res.ok) return { ok: false, reason: `token_exchange_${res.status}` };
  const body = (await res.json()) as { id_token?: string };
  if (!body.id_token) return { ok: false, reason: 'no_id_token' };

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(body.id_token, keySet(d.jwks_uri), {
      issuer: ISSUERS,
      audience: config.clientId,
    }));
  } catch {
    return { ok: false, reason: 'signature' };
  }
  return checkIdTokenClaims(payload as JWTPayload & Record<string, unknown>, {
    clientId: config.clientId,
    nonce: flow.nonce,
  });
}
