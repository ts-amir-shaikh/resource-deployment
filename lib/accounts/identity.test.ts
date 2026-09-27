import { describe, expect, it } from 'vitest';
import { findSignInAccount, isPlaceholderEmail, isUsableEmail, normaliseEmail, signInLookup } from './identity';

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

describe('findSignInAccount (R12, R14, R15)', () => {
  const priya = { id: 1, username: 'priya', email: 'priya@techstalwarts.com' };
  const mamta = { id: 2, username: 'mamta', email: null };
  const accounts = [priya, mamta];

  it('an address in any case finds the account stored lower-case', () => {
    expect(findSignInAccount(accounts, signInLookup('Priya@TechStalwarts.com'))).toBe(priya);
  });

  it('Covers AE4. a username finds an account while it has no email', () => {
    expect(findSignInAccount(accounts, signInLookup('Mamta'))).toBe(mamta);
  });

  it('Covers AE4. once an email is set, the username no longer signs in but the email does', () => {
    const withEmail = [priya, { ...mamta, email: 'mamta@techstalwarts.com' }];
    expect(findSignInAccount(withEmail, signInLookup('mamta'))).toBeNull();
    expect(findSignInAccount(withEmail, signInLookup('mamta@techstalwarts.com'))?.id).toBe(2);
  });

  it('the username of an account with an email is refused even though the account exists', () => {
    expect(findSignInAccount(accounts, signInLookup('priya'))).toBeNull();
  });

  it('an unknown address, a placeholder and blank input find nothing', () => {
    expect(findSignInAccount(accounts, signInLookup('nobody@techstalwarts.com'))).toBeNull();
    expect(findSignInAccount(accounts, signInLookup('priya@placeholder.local'))).toBeNull();
    expect(findSignInAccount(accounts, signInLookup(''))).toBeNull();
  });

  it('a stored placeholder email counts as no email, so the username still works', () => {
    const joined = { id: 3, username: 'ravi', email: 'ravi.k@placeholder.local' };
    expect(findSignInAccount([joined], signInLookup('ravi'))).toBe(joined);
  });
});
