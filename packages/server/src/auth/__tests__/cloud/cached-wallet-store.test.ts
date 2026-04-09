import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { CachedWalletStore } from '../../cloud/cached-wallet-store';
import type { ConsumeResult, WalletStore } from '../../wallet-store';

// ============================================================================
// Mock WalletStore (simulates the inner CloudWalletStore)
// ============================================================================

class MockWalletStore implements WalletStore {
  consumeResult: ConsumeResult = { success: true, consumed: 1, limit: 100, remaining: 99 };
  consumption = 0;
  callCount = { consume: 0, unconsume: 0, getConsumption: 0 };
  shouldThrow = false;

  async consume(
    _resourceType: string,
    _resourceId: string,
    _entitlement: string,
    _periodStart: Date,
    _periodEnd: Date,
    _limit: number,
    _amount?: number,
  ): Promise<ConsumeResult> {
    this.callCount.consume++;
    if (this.shouldThrow) throw new Error('Cloud error');
    return this.consumeResult;
  }

  async unconsume(
    _resourceType: string,
    _resourceId: string,
    _entitlement: string,
    _periodStart: Date,
    _periodEnd: Date,
    _amount?: number,
  ): Promise<void> {
    this.callCount.unconsume++;
    if (this.shouldThrow) throw new Error('Cloud error');
  }

  async getConsumption(
    _resourceType: string,
    _resourceId: string,
    _entitlement: string,
    _periodStart: Date,
    _periodEnd: Date,
  ): Promise<number> {
    this.callCount.getConsumption++;
    if (this.shouldThrow) throw new Error('Cloud error');
    return this.consumption;
  }

  async getBatchConsumption(
    _resourceType: string,
    _resourceId: string,
    limitKeys: string[],
    _periodStart: Date,
    _periodEnd: Date,
  ): Promise<Map<string, number>> {
    if (this.shouldThrow) throw new Error('Cloud error');
    const result = new Map<string, number>();
    for (const key of limitKeys) {
      result.set(key, this.consumption);
    }
    return result;
  }

  dispose(): void {}
}

// ============================================================================
// Tests
// ============================================================================

describe('Feature: CachedWalletStore', () => {
  let inner: MockWalletStore;
  const periodStart = new Date('2026-03-01T00:00:00Z');
  const periodEnd = new Date('2026-04-01T00:00:00Z');

  beforeEach(() => {
    inner = new MockWalletStore();
  });

  describe('Given a successful cloud response for getConsumption', () => {
    describe('When calling getConsumption the first time', () => {
      it('Then delegates to the inner store', async () => {
        inner.consumption = 42;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        const result = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        expect(result).toBe(42);
        expect(inner.callCount.getConsumption).toBe(1);
      });
    });

    describe('When calling getConsumption again within TTL', () => {
      it('Then returns cached value without calling inner store', async () => {
        inner.consumption = 42;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );
        inner.consumption = 99; // Change underlying value
        const result = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        expect(result).toBe(42); // Still cached
        expect(inner.callCount.getConsumption).toBe(1); // Only called once
      });
    });

    describe('When cache expires after TTL', () => {
      it('Then calls the inner store again', async () => {
        inner.consumption = 42;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 50 }); // 50ms TTL

        await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        // Wait for cache to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        inner.consumption = 99;
        const result = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        expect(result).toBe(99); // Fresh value
        expect(inner.callCount.getConsumption).toBe(2);
      });
    });
  });

  describe('Given the inner store fails on getConsumption', () => {
    describe('When stale cached data exists (expired TTL)', () => {
      it('Then returns the stale cached value', async () => {
        inner.consumption = 42;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 50 }); // 50ms TTL

        // Populate cache
        await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        // Wait for cache to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        // Now fail — should serve stale cache
        inner.shouldThrow = true;
        const result = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        expect(result).toBe(42); // Stale cache served
      });
    });

    describe('When fresh cached data exists', () => {
      it('Then returns the cached value', async () => {
        inner.consumption = 42;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        // Populate cache
        await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        // Now fail
        inner.shouldThrow = true;
        const result = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        // Serve from cache even though inner failed
        expect(result).toBe(42);
      });
    });

    describe('When no cached data exists', () => {
      it('Then throws the error from the inner store', async () => {
        inner.shouldThrow = true;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        await expect(
          cached.getConsumption('tenant', 'tenant_abc', 'prompt:create', periodStart, periodEnd),
        ).rejects.toThrow('Cloud error');
      });
    });
  });

  describe('Given a consume() call', () => {
    describe('When the inner store succeeds', () => {
      it('Then delegates to the inner store and updates cache', async () => {
        inner.consumeResult = { success: true, consumed: 48, limit: 100, remaining: 52 };
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        const result = await cached.consume(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
          100,
          1,
        );

        expect(result).toEqual({ success: true, consumed: 48, limit: 100, remaining: 52 });
        expect(inner.callCount.consume).toBe(1);

        // Cache should now reflect the new consumed count
        inner.shouldThrow = true; // Prevent any further cloud calls
        const consumption = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );
        expect(consumption).toBe(48);
      });
    });

    describe('When the inner store fails', () => {
      it('Then throws the error (consume is never cached-fallback)', async () => {
        inner.shouldThrow = true;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        await expect(
          cached.consume('tenant', 'tenant_abc', 'prompt:create', periodStart, periodEnd, 100, 1),
        ).rejects.toThrow('Cloud error');
      });
    });
  });

  describe('Given an unconsume() call', () => {
    describe('When the inner store succeeds', () => {
      it('Then delegates to the inner store and invalidates cache', async () => {
        inner.consumption = 48;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        // Populate cache
        await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );

        // Unconsume should invalidate cache
        await cached.unconsume('tenant', 'tenant_abc', 'prompt:create', periodStart, periodEnd, 1);

        // Next getConsumption should hit the inner store
        inner.consumption = 47;
        const result = await cached.getConsumption(
          'tenant',
          'tenant_abc',
          'prompt:create',
          periodStart,
          periodEnd,
        );
        expect(result).toBe(47);
        expect(inner.callCount.getConsumption).toBe(2); // Called twice (initial + after invalidation)
      });
    });
  });

  describe('Given dispose() is called', () => {
    it('Then clears the cache and disposes the inner store', () => {
      const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });
      expect(() => cached.dispose()).not.toThrow();
    });
  });

  describe('Given a getBatchConsumption() call', () => {
    describe('When the inner store succeeds', () => {
      it('Then delegates to the inner store and returns the result', async () => {
        inner.consumption = 10;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        const result = await cached.getBatchConsumption(
          'tenant',
          'tenant_abc',
          ['prompt:create', 'task:create'],
          periodStart,
          periodEnd,
        );

        expect(result).toBeInstanceOf(Map);
        expect(result.get('prompt:create')).toBe(10);
        expect(result.get('task:create')).toBe(10);
      });
    });

    describe('When the inner store fails', () => {
      it('Then propagates the error (no cache fallback for batch)', async () => {
        inner.shouldThrow = true;
        const cached = new CachedWalletStore(inner, { cacheTtlMs: 5000 });

        await expect(
          cached.getBatchConsumption(
            'tenant',
            'tenant_abc',
            ['prompt:create'],
            periodStart,
            periodEnd,
          ),
        ).rejects.toThrow('Cloud error');
      });
    });
  });

  describe('Given default TTL', () => {
    it('Then uses 30 seconds', () => {
      const cached = new CachedWalletStore(inner);
      expect(cached.cacheTtlMs).toBe(30_000);
    });
  });
});
