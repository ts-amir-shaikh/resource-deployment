import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * `/api/integration/*` is public to middleware: there is no cookie session for
 * a machine caller. Each route's only access control is the integration()
 * wrapper, so a route that skips it would be open to the internet. Like the
 * chokepoint scan, this makes that failure loud.
 */

const DIR = path.resolve(__dirname, '../app/api/integration');

function routes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) routes(full, out);
    else if (entry === 'route.ts') out.push(full);
  }
  return out;
}

describe('every integration route authenticates a key', () => {
  const files = routes(DIR);

  it('finds the routes it is guarding', () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  for (const f of files) {
    const rel = path.relative(DIR, f);
    const src = readFileSync(f, 'utf8');

    it(`${rel} calls integration()`, () => {
      expect(/\bintegration\s*\(/.test(src)).toBe(true);
    });

    it(`${rel} exports only HTTP handlers`, () => {
      const exported = [...src.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]);
      for (const name of exported) expect(['GET', 'POST', 'PUT', 'DELETE', 'dynamic']).toContain(name);
    });
  }

  it('write routes ask for a read-write key', () => {
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      if (/export async function (POST|PUT|DELETE)/.test(src)) {
        expect(src, f).toMatch(/integration\(req, 'read-write'/);
      }
    }
  });
});
