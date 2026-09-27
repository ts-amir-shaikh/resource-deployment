/**
 * Email as the sign-in identifier (R2, R12, R14).
 *
 * Addresses are stored and compared lower-case. The `@placeholder.local`
 * addresses that converting a won requirement creates for a joined candidate
 * with no email are never usable: they cannot receive a link and cannot be
 * signed in with, until someone corrects them.
 */

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isPlaceholderEmail(email: string): boolean {
  return normaliseEmail(email).endsWith('@placeholder.local');
}

export function isUsableEmail(raw: string): boolean {
  const email = normaliseEmail(raw);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isPlaceholderEmail(email);
}

export type SignInLookup = { by: 'email' | 'username'; value: string } | null;

/**
 * How to find the account for what someone typed in the sign-in box. An
 * address is matched by email; anything else is a username, which only an
 * account with no email yet still answers to (the caller enforces that).
 */
export function signInLookup(raw: string): SignInLookup {
  const value = normaliseEmail(raw);
  if (!value) return null;
  if (value.includes('@')) return isPlaceholderEmail(value) ? null : { by: 'email', value };
  return { by: 'username', value };
}

type Identifiable = { username: string; email: string | null };

/**
 * The account a sign-in attempt names, or null. A username only answers for
 * an account with no usable email: once Admin sets one, the email is the only
 * identifier (AE4). A placeholder address counts as no email.
 */
export function findSignInAccount<T extends Identifiable>(accounts: T[], lookup: SignInLookup): T | null {
  if (!lookup) return null;
  if (lookup.by === 'email') {
    return accounts.find((a) => a.email != null && normaliseEmail(a.email) === lookup.value) ?? null;
  }
  return (
    accounts.find(
      (a) => a.username.toLowerCase() === lookup.value && !(a.email && isUsableEmail(a.email)),
    ) ?? null
  );
}
