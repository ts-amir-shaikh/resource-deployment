import { SignJWT, jwtVerify } from 'jose';

/**
 * Session and password handling for the app's three roles.
 *
 * A successful login mints a signed JWT carrying who the holder is and what
 * they may do — verification uses `jose` and Web Crypto only, both of which
 * run in the Edge runtime that Next.js middleware uses (node:crypto does not).
 * That matters: the role check happens in middleware, before any route code.
 */

export const SESSION_COOKIE = 'rd_session';

/**
 * Set by middleware on every signed-in request (and stripped from anything
 * arriving from outside), so server code knows the request needs the account
 * check. Defined here because middleware runs on the Edge and cannot import
 * lib/session.ts.
 */
export const SIGNED_IN_HEADER = 'x-rd-auth';
/** The requested path, so a page can return to it after a session refresh. */
export const PATH_HEADER = 'x-rd-path';
const SESSION_HOURS = 12;

/**
 * Five roles. "Leadgen head", "sales head" and "TA lead" are the `is_team_lead`
 * flag on the corresponding role, not roles of their own — a head is a working
 * member with a wider view, which is what a flag is for.
 */
export const ROLES = [
  'admin',
  'management',
  'ta',
  'leadgen',
  'sales',
  'accounts',
  'resource_manager',
  'interviewer',
  'resource',
] as const;
export type Role = (typeof ROLES)[number];

/**
 * Roles that can be assigned today but whose screens are not built yet. A
 * person holding one sees only the holding page until the "New roles" plan
 * defines their access. Listed once here so the access table, the landing
 * path and the tests all read the same set.
 */
export const PENDING_ROLES: readonly Role[] = ['accounts', 'resource_manager', 'interviewer', 'resource'];

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin',
  management: 'Management',
  ta: 'TA Team',
  leadgen: 'Lead Generation',
  sales: 'Sales',
  accounts: 'Accounts',
  resource_manager: 'Resource Manager',
  interviewer: 'Interviewer',
  resource: 'Resource',
};

/** Roles on which `is_team_lead` means something. */
export const TEAM_ROLES: readonly Role[] = ['ta', 'leadgen', 'sales'];

export type Session = {
  /** User id, or 0 for the legacy shared-password fallback account. */
  uid: number;
  name: string;
  role: Role;
  /**
   * The account's session version when this token was issued. A token from
   * before versions existed has none, which reads as 0 — the value every
   * account starts at — so nobody is signed out by the release itself.
   */
  sv: number;
  /** Issue time in seconds (the JWT's own `iat`); absent before signing. */
  iat?: number;
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to a random string of at least 32 characters.',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session): Promise<string> {
  const { iat: _stale, ...claims } = session;
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

/** Returns the session payload, or null when the token is absent or invalid. */
export async function verifySession(
  token: string | undefined,
): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const role = payload.role;
    // A token signed before roles existed, or one that has been tampered with
    // into an unknown role, must not fall through as a valid session.
    if (typeof role !== 'string' || !ROLES.includes(role as Role)) return null;
    return {
      uid: typeof payload.uid === 'number' ? payload.uid : 0,
      name: typeof payload.name === 'string' ? payload.name : 'User',
      role: role as Role,
      sv: typeof payload.sv === 'number' ? payload.sv : 0,
      iat: typeof payload.iat === 'number' ? payload.iat : 0,
    };
  } catch {
    return null;
  }
}

/* ── Password hashing (PBKDF2-SHA256 via Web Crypto) ────────── */

const PBKDF2_ITERATIONS = 210_000;
const KEY_BITS = 256;

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    key,
    KEY_BITS,
  );
  return toHex(bits);
}

/**
 * Constant-time comparison so a wrong password cannot be narrowed down by
 * timing how long the check takes.
 */
function constantTimeEquals(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  return constantTimeEquals(await hashPassword(password, salt), expectedHash);
}

/**
 * The pre-users shared password. Still honoured, but ONLY while the users
 * table is empty — see the login route. That keeps the deployed app reachable
 * through the changeover instead of locking everyone out the moment this ships.
 */
export function legacyPasswordMatches(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return constantTimeEquals(candidate, expected);
}

export const SESSION_MAX_AGE = SESSION_HOURS * 60 * 60;
