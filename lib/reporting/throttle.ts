/**
 * A per-instance token bucket keyed by token id.
 *
 * SUPPLEMENTARY ONLY. A serverless platform runs many instances and resets
 * them at will, so this limit can be exceeded or forgotten at any moment. It
 * absorbs a burst that reaches a single instance; it is not a security
 * boundary. The control of record is the Vercel Firewall rate-limit rule on
 * /api/reporting/* (docs/reporting-api/runbook.md). Do not rely on this file
 * for protection.
 */

export const THROTTLE_PER_MINUTE = 30;
const MAX_BUCKETS = 1000;

type Bucket = { tokens: number; updated: number };

export class Throttle {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly perMinute = THROTTLE_PER_MINUTE,
    private readonly now: () => number = Date.now,
  ) {}

  /** `allowed`, or how many whole seconds to wait before the next request. */
  take(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const t = this.now();
    const refillPerMs = this.perMinute / 60_000;
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= MAX_BUCKETS) this.buckets.clear();
      b = { tokens: this.perMinute, updated: t };
    } else {
      b.tokens = Math.min(this.perMinute, b.tokens + (t - b.updated) * refillPerMs);
      b.updated = t;
    }
    this.buckets.set(key, b);
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return { allowed: true };
    }
    const waitMs = (1 - b.tokens) / refillPerMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  reset(): void {
    this.buckets.clear();
  }
}
