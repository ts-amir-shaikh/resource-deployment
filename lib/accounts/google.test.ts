import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizationUrl, checkIdTokenClaims, googleConfig, newFlow, pkceChallenge } from './google';
import { findSignInAccount, signInLookup } from './identity';

const CLIENT_ID = 'client-123.apps.googleusercontent.com';
const NOW = new Date('2026-09-28T10:00:00Z');
const nowSec = Math.floor(NOW.getTime() / 1000);

function claims(over: Record<string, unknown> = {}) {
  return {
    iss: 'https://accounts.google.com',
    aud: CLIENT_ID,
    exp: nowSec + 600,
    iat: nowSec - 10,
    nonce: 'nonce-abc',
    email: 'Priya@TechStalwarts.com',
    email_verified: true,
    ...over,
  };
}

const expected = { clientId: CLIENT_ID, nonce: 'nonce-abc', now: NOW };

describe('checkIdTokenClaims (KTD4)', () => {
  it('the right issuer, audience, time, nonce and a verified email pass, lower-casing the email', () => {
    expect(checkIdTokenClaims(claims(), expected)).toEqual({ ok: true, email: 'priya@techstalwarts.com' });
  });

  it('accepts the issuer without the scheme too', () => {
    expect(checkIdTokenClaims(claims({ iss: 'accounts.google.com' }), expected).ok).toBe(true);
  });

  it('a wrong issuer fails', () => {
    expect(checkIdTokenClaims(claims({ iss: 'https://evil.example' }), expected).ok).toBe(false);
  });

  it('a wrong audience fails', () => {
    expect(checkIdTokenClaims(claims({ aud: 'someone-else' }), expected).ok).toBe(false);
    expect(checkIdTokenClaims(claims({ aud: ['someone-else'] }), expected).ok).toBe(false);
  });

  it('a mismatched or missing nonce fails', () => {
    expect(checkIdTokenClaims(claims({ nonce: 'other' }), expected).ok).toBe(false);
    expect(checkIdTokenClaims(claims({ nonce: undefined }), expected).ok).toBe(false);
  });

  it('an unverified email fails', () => {
    expect(checkIdTokenClaims(claims({ email_verified: false }), expected).ok).toBe(false);
    expect(checkIdTokenClaims(claims({ email_verified: undefined }), expected).ok).toBe(false);
  });

  it('an expired token fails', () => {
    expect(checkIdTokenClaims(claims({ exp: nowSec - 1 }), expected).ok).toBe(false);
  });

  it('a token with no email fails', () => {
    expect(checkIdTokenClaims(claims({ email: undefined }), expected).ok).toBe(false);
  });
});

describe('matching the Google email (R13)', () => {
  const accounts = [{ id: 1, username: 'priya', email: 'priya@techstalwarts.com' }];

  it('Covers AE1. a different Google address does not match, and nothing is created', () => {
    const r = checkIdTokenClaims(claims({ email: 'priya.personal@gmail.com' }), expected);
    expect(r.ok && findSignInAccount(accounts, signInLookup(r.email))).toBeNull();
    expect(accounts).toHaveLength(1);
  });

  it('the registered address matches whatever its case', () => {
    const r = checkIdTokenClaims(claims(), expected);
    expect(r.ok && findSignInAccount(accounts, signInLookup(r.email))?.id).toBe(1);
  });
});

describe('the sign-in round trip', () => {
  it('the PKCE challenge is the base64url SHA-256 of the verifier', () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const want = createHash('sha256').update(verifier).digest('base64url');
    expect(pkceChallenge(verifier)).toBe(want);
    expect(pkceChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('each flow gets fresh random state, nonce and verifier', () => {
    const a = newFlow('/my');
    const b = newFlow('/my');
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('the Google address carries the client, the exact redirect, the scopes, state, nonce and the S256 challenge', () => {
    const flow = newFlow(null);
    const url = new URL(
      authorizationUrl(
        'https://accounts.google.com/o/oauth2/v2/auth',
        { clientId: CLIENT_ID, clientSecret: 's', redirectUri: 'https://app.example/api/auth/google/callback' },
        flow,
      ),
    );
    const q = url.searchParams;
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(q.get('client_id')).toBe(CLIENT_ID);
    expect(q.get('redirect_uri')).toBe('https://app.example/api/auth/google/callback');
    expect(q.get('response_type')).toBe('code');
    expect(q.get('scope')).toBe('openid email profile');
    expect(q.get('state')).toBe(flow.state);
    expect(q.get('nonce')).toBe(flow.nonce);
    expect(q.get('code_challenge')).toBe(pkceChallenge(flow.verifier));
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('prompt')).toBe('select_account');
  });

  it('Google sign-in is off unless the client and the public address are all set', () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toBeNull();
    expect(
      googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', APP_BASE_URL: 'https://app.example/' }),
    ).toEqual({ clientId: 'a', clientSecret: 'b', redirectUri: 'https://app.example/api/auth/google/callback' });
  });
});
