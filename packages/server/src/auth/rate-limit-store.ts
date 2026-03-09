/**
 * Rate Limit Store — pluggable rate limiting for auth module
 */

import type { RateLimitResult, RateLimitStore } from './types';

interface RateLimitEntry {
  count: number;
  resetAt: Date;
}

const CLEANUP_INTERVAL_MS = 60_000;

export class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  async check(key: string, maxAttempts: number, windowMs: number): Promise<RateLimitResult> {
    const now = new Date();
    const entry = this.store.get(key);

    if (!entry || entry.resetAt < now) {
      const resetAt = new Date(now.getTime() + windowMs);
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: maxAttempts - 1, resetAt };
    }

    if (entry.count >= maxAttempts) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    entry.count++;
    return { allowed: true, remaining: maxAttempts - entry.count, resetAt: entry.resetAt };
  }

  dispose(): void {
    clearInterval(this.cleanupTimer);
  }

  private cleanup(): void {
    const now = new Date();
    for (const [key, entry] of this.store) {
      if (entry.resetAt < now) {
        this.store.delete(key);
      }
    }
  }
}
