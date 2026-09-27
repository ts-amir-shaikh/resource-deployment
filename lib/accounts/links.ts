import { createHash, randomBytes } from 'node:crypto';

/**
 * Password links (R7, R8, KTD3).
 *
 * The emailed link carries 32 random bytes; the database keeps only their
 * SHA-256, so a copy of the table cannot be used to set anyone's password.
 * The code travels after `#` in the address: browsers never send that part to
 * a server, a proxy log or an analytics tool, and the set-password page reads
 * it in the browser and posts it.
 */

export const LINK_TTL_HOURS = 72;

export type LinkRow = { expiresAt: string; usedAt: string | null; cancelledAt: string | null };
export type LinkStatus = 'valid' | 'used' | 'cancelled' | 'expired';

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function expiryFrom(now: Date = new Date()): string {
  return new Date(now.getTime() + LINK_TTL_HOURS * 3_600_000).toISOString();
}

export function linkStatus(link: LinkRow, now: Date = new Date()): LinkStatus {
  if (link.usedAt) return 'used';
  if (link.cancelledAt) return 'cancelled';
  if (now.toISOString() >= link.expiresAt) return 'expired';
  return 'valid';
}

export function setPasswordUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/set-password#t=${token}`;
}
