import { describe, expect, it } from 'vitest';
import { LINK_TTL_HOURS, expiryFrom, generateToken, hashToken, linkStatus, setPasswordUrl } from './links';

const sent = new Date('2026-09-28T10:00:00Z');
const hours = (h: number) => new Date(sent.getTime() + h * 3_600_000);

describe('password links (R8)', () => {
  it('a link lives 72 hours', () => {
    expect(LINK_TTL_HOURS).toBe(72);
    const link = { expiresAt: expiryFrom(sent), usedAt: null, cancelledAt: null };
    expect(linkStatus(link, hours(71.9))).toBe('valid');
    expect(linkStatus(link, hours(72.1))).toBe('expired');
  });

  it('a used link is refused', () => {
    expect(linkStatus({ expiresAt: expiryFrom(sent), usedAt: hours(1).toISOString(), cancelledAt: null }, hours(2))).toBe('used');
  });

  it('Covers AE3. a link cancelled by a newer one is refused', () => {
    expect(linkStatus({ expiresAt: expiryFrom(sent), usedAt: null, cancelledAt: hours(24).toISOString() }, hours(25))).toBe('cancelled');
  });

  it('tokens are long, random and URL-safe', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('only a one-way hash is stored, and it is stable', () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the code travels after # so it never reaches a server or analytics', () => {
    const url = setPasswordUrl('https://staffing.techstalwarts.com', 'abc_DEF-1');
    expect(url).toBe('https://staffing.techstalwarts.com/set-password#t=abc_DEF-1');
    expect(new URL(url).search).toBe('');
  });
});
