/**
 * WalletStore — consumption tracking for plan-limited entitlements.
 *
 * Tracks per-org usage within billing periods with atomic
 * check-and-increment operations.
 */

// ============================================================================
// Types
// ============================================================================

export interface WalletEntry {
  orgId: string;
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
    orgId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    limit: number,
    amount?: number,
  ): Promise<ConsumeResult>;
  unconsume(
    orgId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    amount?: number,
  ): Promise<void>;
  getConsumption(
    orgId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number>;
  dispose(): void;
}

// ============================================================================
// InMemoryWalletStore
// ============================================================================

export class InMemoryWalletStore implements WalletStore {
  private entries = new Map<string, WalletEntry>();

  private key(orgId: string, entitlement: string, periodStart: Date): string {
    return `${orgId}:${entitlement}:${periodStart.getTime()}`;
  }

  async consume(
    orgId: string,
    entitlement: string,
    periodStart: Date,
    periodEnd: Date,
    limit: number,
    amount = 1,
  ): Promise<ConsumeResult> {
    const k = this.key(orgId, entitlement, periodStart);

    // Lazy init
    if (!this.entries.has(k)) {
      this.entries.set(k, { orgId, entitlement, periodStart, periodEnd, consumed: 0 });
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
    orgId: string,
    entitlement: string,
    periodStart: Date,
    _periodEnd: Date,
    amount = 1,
  ): Promise<void> {
    const k = this.key(orgId, entitlement, periodStart);
    const entry = this.entries.get(k);
    if (!entry) return;

    entry.consumed = Math.max(0, entry.consumed - amount);
  }

  async getConsumption(
    orgId: string,
    entitlement: string,
    periodStart: Date,
    _periodEnd: Date,
  ): Promise<number> {
    const k = this.key(orgId, entitlement, periodStart);
    const entry = this.entries.get(k);
    return entry?.consumed ?? 0;
  }

  dispose(): void {
    this.entries.clear();
  }
}
