import { describe, expect, it } from 'vitest';
import { isPlaceholderEmail, isUsableEmail, normaliseEmail, signInLookup } from './identity';

describe('email handling (R2, R12)', () => {
  it('stores and compares addresses lower-case and trimmed', () => {
    expect(normaliseEmail('  Priya@TechStalwarts.com ')).toBe('priya@techstalwarts.com');
  });

  it('recognises the placeholder addresses conversion creates', () => {
    expect(isPlaceholderEmail('priya.nair@placeholder.local')).toBe(true);
    expect(isPlaceholderEmail('priya@techstalwarts.com')).toBe(false);
  });

  it('a usable email is a real-looking address that is not a placeholder', () => {
    expect(isUsableEmail('priya@techstalwarts.com')).toBe(true);
    expect(isUsableEmail('priya@gmail.com')).toBe(true);
    expect(isUsableEmail('priya.nair@placeholder.local')).toBe(false);
    expect(isUsableEmail('priya')).toBe(false);
    expect(isUsableEmail('priya@')).toBe(false);
    expect(isUsableEmail('pri ya@x.com')).toBe(false);
  });
});

describe('signInLookup (R12, R14)', () => {
  it('an identifier with @ is looked up by email, lower-cased', () => {
    expect(signInLookup('Priya@TechStalwarts.com')).toEqual({ by: 'email', value: 'priya@techstalwarts.com' });
  });

  it('Covers AE4. anything else is a username, for accounts that have no email yet', () => {
    expect(signInLookup('Mamta ')).toEqual({ by: 'username', value: 'mamta' });
  });

  it('a placeholder address is never a sign-in identifier', () => {
    expect(signInLookup('x@placeholder.local')).toBeNull();
  });

  it('blank input is no identifier', () => {
    expect(signInLookup('   ')).toBeNull();
  });
});
