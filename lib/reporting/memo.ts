/**
 * A small per-instance result cache, there to bound database load when the
 * same report is requested repeatedly — not to make anything faster for a
 * single caller.
 *
 * Rules the handler relies on (and tests pin):
 *  - It is consulted only AFTER the bearer token and the scope have been
 *    verified on the current request, so a revoked or wrong-scope token never
 *    receives a cached body.
 *  - The key is built by `cacheKey()` from the endpoint, the schema version
 *    and EVERY validated parameter after defaults, plus the resolved as-of
 *    date. Nothing unvalidated is ever part of a key.
 *  - Phase 1 scopes grant a whole dataset and no token has row-level
 *    filters, so the token id is deliberately not in the key. If a per-token
 *    restriction is ever added it MUST be added to `cacheKey()` in the same
 *    change (tests/reporting-memo.test.ts guards the key's inputs).
 *  - What is stored is only the mapped, allowlisted result — never a raw row
 *    and never an envelope.
 *  - It is per instance: other instances have their own copy. TTL is short.
 */

export const MEMO_TTL_MS = 60_000;
export const MEMO_MAX_ENTRIES = 200;
export const RESULT_SCHEMA_VERSION = 'v1';

export type CacheKeyInput = {
  endpoint: string;
  /** The validated parameters after defaults, exactly as echoed in meta.params. */
  params: Record<string, string | number | boolean | undefined>;
  /** The resolved Asia/Kolkata date, so entries roll over at local midnight. */
  asOf: string;
};

export function cacheKey({ endpoint, params, asOf }: CacheKeyInput): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] !== undefined)
    .sort()
    .map((k) => [k, params[k]]);
  return `${endpoint}|${RESULT_SCHEMA_VERSION}|${asOf}|${JSON.stringify(sorted)}`;
}

type Entry<T> = { value: T; expires: number };

export class ResultMemo<T> {
  private store = new Map<string, Entry<T>>();
  private inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs = MEMO_TTL_MS,
    private readonly maxEntries = MEMO_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.store.size;
  }

  peek(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expires <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  /**
   * Returns a fresh cached value, or runs `compute` once even when several
   * identical requests arrive together. `hit` tells the caller which it was.
   * A failed computation is never cached.
   */
  async getOrCompute(key: string, compute: () => Promise<T>): Promise<{ value: T; hit: boolean }> {
    const cached = this.peek(key);
    if (cached !== undefined) return { value: cached, hit: true };

    const running = this.inflight.get(key);
    if (running) return { value: await running, hit: true };

    const p = compute();
    this.inflight.set(key, p);
    try {
      const value = await p;
      this.set(key, value);
      return { value, hit: false };
    } finally {
      this.inflight.delete(key);
    }
  }

  private set(key: string, value: T): void {
    if (!this.store.has(key) && this.store.size >= this.maxEntries) {
      // Drop the entry closest to expiry.
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, e] of this.store) {
        if (e.expires < oldest) {
          oldest = e.expires;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expires: this.now() + this.ttlMs });
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }
}
