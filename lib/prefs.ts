/**
 * Names of the cookies that hold per-user layout preferences.
 *
 * In a module of its own with no 'use client' directive: a constant exported
 * from a client component becomes a client *reference* when a server
 * component imports it, not the string — and `cookies().get(ref)` would
 * silently never match.
 */
export const SIDEBAR_COOKIE = 'sidebar';
