/**
 * WalletStore — consumption tracking for plan-limited entitlements.
 *
 * Tracks per-tenant usage within billing periods with atomic
 * check-and-increment operations.
 */

// ============================================================================
// Types
// ============================================================================

export interface WalletEntry {
  resourceType: string;
  resourceId: string;
  entitlement: string;
  periodStart: Date;
  periodEnd: Date;
  consumed: number;
}

export interface ConsumeResult {
  success: boolean;
  consumed: number;
  limit: number;
  remaining: number;
}

export interface WalletStore {
  consume(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    limit: number,
    amount?: number,
  ): Promise<ConsumeResult>;
  unconsume(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    amount?: number,
  ): Promise<void>;
  getConsumption(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number>;
  getBatchConsumption(
    resourceType: string,
    resourceId: string,
    limitKeys: string[],
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Map<string, number>>;
  dispose(): void;
}

// ============================================================================
// InMemoryWalletStore
// ============================================================================

export class InMemoryWalletStore implements WalletStore {
  private entries = new Map<string, WalletEntry>();

  private key(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
  ): string {
    return `${resourceType}:${resourceId}:${entitlement}:${periodStart.getTime()}`;
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
    const k = this.key(resourceType, resourceId, entitlement, periodStart);

    // Lazy init
    if (!this.entries.has(k)) {
      this.entries.set(k, {
        resourceType,
        resourceId,
        entitlement,
        periodStart,
        periodEnd,
        consumed: 0,
      });
    }

    const entry = this.entries.get(k)!;

    // Atomic check: can we fit the amount?
    if (entry.consumed + amount > limit) {
      return {
        success: false,
        consumed: entry.consumed,
        limit,
        remaining: Math.max(0, limit - entry.consumed),
      };
    }

    // Increment
    entry.consumed += amount;

    return {
      success: true,
      consumed: entry.consumed,
      limit,
      remaining: limit - entry.consumed,
    };
  }

  async unconsume(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    _periodEnd: Date,
    amount = 1,
  ): Promise<void> {
    const k = this.key(resourceType, resourceId, entitlement, periodStart);
    const entry = this.entries.get(k);
    if (!entry) return;

    entry.consumed = Math.max(0, entry.consumed - amount);
  }

  async getConsumption(
    resourceType: string,
    resourceId: string,
    entitlement: string,
    periodStart: Date,
    _periodEnd: Date,
  ): Promise<number> {
    const k = this.key(resourceType, resourceId, entitlement, periodStart);
    const entry = this.entries.get(k);
    return entry?.consumed ?? 0;
  }

  async getBatchConsumption(
    resourceType: string,
    resourceId: string,
    limitKeys: string[],
    periodStart: Date,
    _periodEnd: Date,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    for (const key of limitKeys) {
      const k = this.key(resourceType, resourceId, key, periodStart);
      const entry = this.entries.get(k);
      result.set(key, entry?.consumed ?? 0);
    }
    return result;
  }

  dispose(): void {
    this.entries.clear();
  }
}
