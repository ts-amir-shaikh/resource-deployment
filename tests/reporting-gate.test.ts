import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware, PUBLIC_EXACT, PUBLIC_PREFIXES } from '@/middleware';
import { canAccess, canWrite } from '@/lib/access';
import { ROLES, SESSION_COOKIE, createSession } from '@/lib/auth';
import { SCOPE_PATHS } from '@/lib/reporting/paths';
import { tokenEnv } from './helpers/reporting';

/**
 * The reporting authentication boundary. The point of these tests is that a
 * browser session of ANY role is irrelevant to /api/reporting, and a reporting
 * token is irrelevant everywhere else.
 */

const BILLING = `http://localhost${SCOPE_PATHS.billing}`;
let token = '';
let raw = '';
const savedEnv = { ...process.env };

beforeAll(async () => {
  process.env.AUTH_SECRET = 'x'.repeat(48);
});

beforeEach(async () => {
  ({ token, raw } = await tokenEnv({ id: 'gate-test', scopes: ['billing', 'invoices'] }));
  process.env.REPORTING_TOKENS = raw;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...savedEnv, AUTH_SECRET: 'x'.repeat(48) };
  vi.restoreAllMocks();
});

const call = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  middleware(new NextRequest(url, init));

const sessionCookie = async (role: (typeof ROLES)[number]) =>
  `${SESSION_COOKIE}=${await createSession({ uid: 1, name: 'T', role, sv: 0 })}`;

const isPassThrough = (res: Response) => res.headers.get('x-middleware-next') === '1';

describe('the reporting gate', () => {
  it('refuses a request with no credentials', async () => {
    const res = await call(BILLING);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
    expect((await res.json()).error.code).toBe('unauthorized');
  });

  it('gives every authentication failure the same response', async () => {
    const bodies = new Set<string>();
    for (const headers of [
      {},
      { authorization: 'Bearer nope' },
      { authorization: `Basic ${token}` },
      { authorization: `Bearer rpt_${'z'.repeat(43)}` },
    ] as Record<string, string>[]) {
      const res = await call(BILLING, { headers });
      expect(res.status).toBe(401);
      bodies.add(JSON.stringify((await res.json()).error));
    }
    expect(bodies.size).toBe(1);
  });

  it('lets a valid token with the right scope through and strips the Cookie header', async () => {
    const res = await call(BILLING, { headers: { authorization: `Bearer ${token}`, cookie: 'rd_session=whatever; other=1' } });
    expect(isPassThrough(res)).toBe(true);
    // Next encodes overridden request headers on the response.
    expect(res.headers.get('x-middleware-override-headers') ?? '').not.toContain('cookie');
    expect(res.headers.get('x-middleware-request-cookie')).toBeNull();
  });

  it('refuses a valid token on a dataset outside its scope', async () => {
    const res = await call(`http://localhost${SCOPE_PATHS.capacity}`, { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('insufficient_scope');
  });

  it('returns 404 for an unknown reporting path, but only to a valid token', async () => {
    const withToken = await call('http://localhost/api/reporting/v1/secrets', { headers: { authorization: `Bearer ${token}` } });
    expect(withToken.status).toBe(404);
    const without = await call('http://localhost/api/reporting/v1/secrets');
    expect(without.status).toBe(401);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('refuses %s with 405 even with a valid token', async (method) => {
    const res = await call(BILLING, { method, headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('refuses everything when REPORTING_TOKENS is missing or invalid', async () => {
    delete process.env.REPORTING_TOKENS;
    expect((await call(BILLING, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
    process.env.REPORTING_TOKENS = 'not json';
    expect((await call(BILLING, { headers: { authorization: `Bearer ${token}` } })).status).toBe(401);
  });

  it('refuses an expired token', async () => {
    const old = await tokenEnv({ expires: '2020-01-01' });
    process.env.REPORTING_TOKENS = old.raw;
    expect((await call(BILLING, { headers: { authorization: `Bearer ${old.token}` } })).status).toBe(401);
  });

  it('does not log token material', async () => {
    const warn = vi.mocked(console.warn);
    await call(BILLING, { headers: { authorization: `Bearer ${token}x` } });
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('reporting_gate_denied');
    expect(logged).not.toContain(token);
  });

  it.each([
    '/api/reporting/v1/billing/',
    '/api/REPORTING/v1/billing',
    '//api/reporting/v1/billing',
    '/api/%72eporting/v1/billing',
    '/api/reporting',
    '/api/reporting/',
  ])('sends %s to the reporting gate, not the session policy', async (path) => {
    // With an admin session and no bearer: the answer is the reporting 401,
    // never the session policy's pass-through.
    const res = await call(`http://localhost${path}`, { headers: { cookie: await sessionCookie('admin') } });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('unauthorized');
  });
});

describe('dot segments', () => {
  it('the URL parser resolves /api/reporting/%2e%2e/invoices to /api/invoices, which the session policy then governs', async () => {
    // Not a bypass: the request IS /api/invoices by the time any code sees it,
    // so it gets that route's role policy (and no reporting data).
    const anon = await call('http://localhost/api/reporting/%2e%2e/invoices');
    expect(anon.status).toBe(401);
    expect((await anon.json()).error).toBe('Not signed in');
    const ta = await call('http://localhost/api/reporting/%2e%2e/invoices', { headers: { cookie: await sessionCookie('ta') } });
    expect(ta.status).toBe(403);
  });
});

describe('sessions and reporting never mix', () => {
  it.each(ROLES)('a %s session alone cannot reach any reporting path', async (role) => {
    for (const path of Object.values(SCOPE_PATHS)) {
      const res = await call(`http://localhost${path}`, { headers: { cookie: await sessionCookie(role) } });
      expect(res.status, `${role} ${path}`).toBe(401);
    }
  });

  it('the access policy denies reporting paths to every role, admin and management included', () => {
    for (const role of ROLES) {
      for (const path of [...Object.values(SCOPE_PATHS), '/api/reporting', '/api/reporting/v1/x', '/api/REPORTING/v1/billing']) {
        expect(canAccess(role, path), `${role} canAccess ${path}`).toBe(false);
        expect(canWrite(role, path), `${role} canWrite ${path}`).toBe(false);
      }
    }
  });

  it('an admin session plus a valid token behaves exactly like the token alone', async () => {
    const alone = await call(BILLING, { headers: { authorization: `Bearer ${token}` } });
    const both = await call(BILLING, { headers: { authorization: `Bearer ${token}`, cookie: await sessionCookie('admin') } });
    expect(both.status).toBe(alone.status);
    expect(isPassThrough(both)).toBe(isPassThrough(alone));
  });

  it('a reporting token does not authenticate any other path', async () => {
    for (const path of ['/api/invoices', '/api/dashboard/summary', '/api/resources', '/invoices', '/']) {
      const res = await call(`http://localhost${path}`, { headers: { authorization: `Bearer ${token}` } });
      expect(isPassThrough(res), path).toBe(false);
      expect([401, 307]).toContain(res.status);
    }
  });

  it('existing session behaviour is unchanged', async () => {
    const admin = await call('http://localhost/api/dashboard/summary', { headers: { cookie: await sessionCookie('admin') } });
    expect(isPassThrough(admin)).toBe(true);
    const ta = await call('http://localhost/api/invoices', { headers: { cookie: await sessionCookie('ta') } });
    expect(ta.status).toBe(403);
    const mgmtWrite = await call('http://localhost/api/clients', { method: 'POST', headers: { cookie: await sessionCookie('management') } });
    expect(mgmtWrite.status).toBe(403);
    const anon = await call('http://localhost/api/invoices');
    expect(anon.status).toBe(401);
  });

  it('the public path lists are unchanged (reporting is not public)', () => {
    expect(PUBLIC_PREFIXES).toEqual(['/share/', '/api/share/', '/jobs/', '/api/jobs/']);
    expect(PUBLIC_EXACT).toEqual([
      '/login',
      '/api/auth/login',
      '/jobs',
      '/api/jobs',
      '/api/health',
      '/set-password',
      '/api/auth/set-password',
      '/api/auth/google/start',
      '/api/auth/google/callback',
    ]);
  });
});

describe('the middleware matcher still covers the reporting paths', () => {
  it('matches every reporting path', async () => {
    const { config } = await import('@/middleware');
    const re = new RegExp(`^${config.matcher[0]}$`);
    for (const p of Object.values(SCOPE_PATHS)) expect(re.test(p), p).toBe(true);
  });
});
