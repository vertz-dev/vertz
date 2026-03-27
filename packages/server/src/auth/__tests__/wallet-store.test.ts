import { describe, expect, it } from 'bun:test';
import { InMemoryWalletStore } from '../wallet-store';

const periodStart = new Date('2026-01-01T00:00:00Z');
const periodEnd = new Date('2026-02-01T00:00:00Z');

describe('InMemoryWalletStore', () => {
  it('consume returns success when under limit', async () => {
    const store = new InMemoryWalletStore();
    const result = await store.consume(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
      5,
    );

    expect(result.success).toBe(true);
    expect(result.consumed).toBe(1);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
  });

  it('consume returns failure when at or over limit', async () => {
    const store = new InMemoryWalletStore();
    // Fill up to limit
    for (let i = 0; i < 5; i++) {
      await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 5);
    }
    // 6th should fail
    const result = await store.consume(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
      5,
    );
    expect(result.success).toBe(false);
    expect(result.consumed).toBe(5);
    expect(result.remaining).toBe(0);
  });

  it('consume lazily initializes wallet entry', async () => {
    const store = new InMemoryWalletStore();
    // No prior entry — consume creates one
    const result = await store.consume(
      'organization',
      'org-new',
      'project:create',
      periodStart,
      periodEnd,
      10,
    );
    expect(result.success).toBe(true);
    expect(result.consumed).toBe(1);
  });

  it('consume with custom amount increments by that amount', async () => {
    const store = new InMemoryWalletStore();
    const result = await store.consume(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
      10,
      3,
    );
    expect(result.success).toBe(true);
    expect(result.consumed).toBe(3);
    expect(result.remaining).toBe(7);
  });

  it('consume with amount exceeding remaining fails', async () => {
    const store = new InMemoryWalletStore();
    await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 5, 4);
    const result = await store.consume(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
      5,
      3,
    );
    expect(result.success).toBe(false);
    expect(result.consumed).toBe(4); // unchanged
    expect(result.remaining).toBe(1);
  });

  it('unconsume decrements consumed count', async () => {
    const store = new InMemoryWalletStore();
    await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 10);
    await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 10);
    await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 10);

    await store.unconsume('organization', 'org-1', 'project:create', periodStart, periodEnd);

    const consumption = await store.getConsumption(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
    );
    expect(consumption).toBe(2);
  });

  it('unconsume does not go below 0', async () => {
    const store = new InMemoryWalletStore();
    await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 10);
    await store.unconsume('organization', 'org-1', 'project:create', periodStart, periodEnd, 5);

    const consumption = await store.getConsumption(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
    );
    expect(consumption).toBe(0);
  });

  it('unconsume is no-op for unknown entry', async () => {
    const store = new InMemoryWalletStore();
    // Should not throw
    await store.unconsume('organization', 'org-unknown', 'project:create', periodStart, periodEnd);
  });

  it('getConsumption returns 0 for unknown entry', async () => {
    const store = new InMemoryWalletStore();
    const consumption = await store.getConsumption(
      'organization',
      'org-1',
      'project:create',
      periodStart,
      periodEnd,
    );
    expect(consumption).toBe(0);
  });

  it('dispose clears all data', async () => {
    const store = new InMemoryWalletStore();
    await store.consume('organization', 'org-1', 'project:create', periodStart, periodEnd, 10);
    store.dispose();
    expect(
      await store.getConsumption('organization', 'org-1', 'project:create', periodStart, periodEnd),
    ).toBe(0);
  });
});
