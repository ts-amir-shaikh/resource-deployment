import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { PUBLIC_EXACT, PUBLIC_PREFIXES } from '@/middleware';

/**
 * The account check (R16) runs at two server-side chokepoints, because the
 * Edge middleware cannot open the AWS host's SQLite file. A page or API route
 * that skips its chokepoint would keep serving a deactivated person for the
 * rest of their 12-hour session — silently, since nothing else would fail.
 * This scan is what makes that failure loud.
 */

const ROOT = path.resolve(__dirname, '..');
const APP = path.join(ROOT, 'app');

function walk(dir: string, name: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, name, out);
    else if (entry === name) out.push(full);
  }
  return out;
}

/** app/pipeline/[id]/page.tsx -> /pipeline/[id]; app/page.tsx -> / */
function routeOf(file: string): string {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).join('/');
  return rel ? `/${rel}` : '/';
}

function isPublic(route: string): boolean {
  if (PUBLIC_EXACT.includes(route)) return true;
  return PUBLIC_PREFIXES.some((p) => route.startsWith(p) || `${route}/` === p);
}

const PAGE_CHECK = /\b(requireCurrentAccount|requireSession|getViewer)\s*\(/;
const ROUTE_CHECK = /\b(handle|getSession|getSessionState)\s*\(/;

describe('every signed-in page checks the account (R16)', () => {
  const pages = walk(APP, 'page.tsx')
    .map((f) => ({ f, route: routeOf(f) }))
    .filter(({ route }) => !isPublic(route));

  it('finds the pages it is guarding', () => {
    expect(pages.length).toBeGreaterThan(15);
  });

  for (const { f, route } of pages) {
    it(route, () => {
      expect(PAGE_CHECK.test(readFileSync(f, 'utf8')), `${route} must call requireCurrentAccount()`).toBe(true);
    });
  }
});

describe('every signed-in API route checks the account (R16)', () => {
  const routes = walk(path.join(APP, 'api'), 'route.ts')
    .map((f) => ({ f, route: routeOf(f) }))
    // The auth routes act on the session itself: sign-in, sign-out and the
    // refresh route, whose job is to handle a session handle() would refuse.
    .filter(({ route }) => !isPublic(route) && !route.startsWith('/api/auth/'));

  it('finds the routes it is guarding', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  for (const { f, route } of routes) {
    it(route, () => {
      expect(ROUTE_CHECK.test(readFileSync(f, 'utf8')), `${route} must go through handle()`).toBe(true);
    });
  }
});
