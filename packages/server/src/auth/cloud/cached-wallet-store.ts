/**
 * CachedWalletStore — TTL-based cache wrapper around a WalletStore.
 *
 * Caches getConsumption() results locally. On inner store failure,
 * serves from cache if available. Mutations (consume/unconsume)
 * always delegate to the inner store and update/invalidate the cache.
 */

import type { ConsumeResult, WalletStore } from '../wallet-store';

// ============================================================================
// Types
// ============================================================================

export interface CachedWalletStoreOptions {
  /** Cache TTL in milliseconds. Defaults to 30_000 (30 seconds). */
  cacheTtlMs?: number;
}

interface CacheEntry {
  value: number;
  expiresAt: number;
}

// ============================================================================
// CachedWalletStore
// ============================================================================

const DEFAULT_CACHE_TTL_MS = 30_000;

export class CachedWalletStore implements WalletStore {
  readonly cacheTtlMs: number;
  private readonly inner: WalletStore;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(inner: WalletStore, options?: CachedWalletStoreOptions) {
    this.inner = inner;
    this.cacheTtlMs = options?.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getConsumption(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const key = this.cacheKey(resourceType, resourceId, entitlement, periodStart);

    // Check cache first
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    try {
      const value = await this.inner.getConsumption(
        resourceType,
        resourceId,
        entitlement,
        periodStart,
        periodEnd,
      );
      this.cache.set(key, { value, expiresAt: Date.now() + this.cacheTtlMs });
      return value;
    } catch (error) {
      // On failure, serve from stale cache if available
      if (cached) {
        return cached.value;
      }
      throw error;
    }
  }

  async consume(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    limit: number,
    amount = 1,
  ): Promise<ConsumeResult> {
    // Mutations always go through — never cached-fallback
    const result = await this.inner.consume(
      resourceType,
      resourceId,
      entitlement,
      periodStart,
      periodEnd,
      limit,
      amount,
    );

    // Update cache with new consumed count
    const key = this.cacheKey(resourceType, resourceId, entitlement, periodStart);
    this.cache.set(key, { value: result.consumed, expiresAt: Date.now() + this.cacheTtlMs });

    return result;
  }

  async unconsume(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    amount = 1,
  ): Promise<void> {
    await this.inner.unconsume(
      resourceType,
      resourceId,
      entitlement,
      periodStart,
      periodEnd,
      amount,
    );

    // Invalidate cache — next read will hit the inner store
    const key = this.cacheKey(resourceType, resourceId, entitlement, periodStart);
    this.cache.delete(key);
  }

  async getBatchConsumption(
    resourceType: string,
    resourceId: string,
    limitKeys: string[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<string, number>> {
    // Delegate to inner store — batch reads bypass the per-key cache
    // to ensure consistency across all returned keys.
    return this.inner.getBatchConsumption(
      resourceType,
      resourceId,
      limitKeys,
      periodStart,
      periodEnd,
    );
  }

  dispose(): void {
    this.cache.clear();
    this.inner.dispose();
  }

  // ==========================================================================
  // Private
  // ==========================================================================

  private cacheKey(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
  ): string {
    return `${resourceType}:${resourceId}:${entitlement}:${periodStart.getTime()}`;
  }
}
