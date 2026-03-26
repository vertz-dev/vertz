import { describe, expect, it } from 'bun:test';
import { InMemoryWalletStore } from '../wallet-store';

describe('Feature: getBatchConsumption', () => {
  it('Then returns consumption for all requested keys in one call', async () => {
    const store = new InMemoryWalletStore();
    const periodStart = new Date('2026-03-01');
    const periodEnd = new Date('2026-04-01');

    // Consume some credits
    await store.consume('tenant-1', 'api-calls', periodStart, periodEnd, 1000, 50);
    await store.consume('tenant-1', 'storage', periodStart, periodEnd, 500, 100);

    const result = await store.getBatchConsumption(
      'tenant-1',
      ['api-calls', 'storage'],
      periodStart,
      periodEnd,
    );

    expect(result.get('api-calls')).toBe(50);
    expect(result.get('storage')).toBe(100);
  });

  it('Then returns 0 for keys with no consumption', async () => {
    const store = new InMemoryWalletStore();
    const periodStart = new Date('2026-03-01');
    const periodEnd = new Date('2026-04-01');

    const result = await store.getBatchConsumption(
      'tenant-1',
      ['api-calls', 'storage'],
      periodStart,
      periodEnd,
    );

    expect(result.get('api-calls')).toBe(0);
    expect(result.get('storage')).toBe(0);
  });
});
