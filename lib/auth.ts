import { SignJWT, jwtVerify } from 'jose';

/**
 * Single shared-password gate for an internal tool.
 *
 * The password is never stored in a cookie — a successful login mints a signed
 * JWT whose only claim is that the holder authenticated. Verification is done
 * with `jose`, which runs in the Edge runtime that Next.js middleware uses
 * (node:crypto does not).
 */

export const SESSION_COOKIE = 'rd_session';
const SESSION_HOURS = 12;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET must be set to a random string of at least 32 characters.',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(): Promise<string> {
  return new SignJWT({ role: 'staff' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, secretKey());
    return true;
  } catch {
    return false;
  }
}

/**
 * Constant-time comparison so a wrong password cannot be discovered by timing
 * how long the check takes.
 */
export function passwordMatches(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;

  const a = new TextEncoder().encode(candidate);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export const SESSION_MAX_AGE = SESSION_HOURS * 60 * 60;
