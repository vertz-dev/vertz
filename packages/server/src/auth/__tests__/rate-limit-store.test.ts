import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { InMemoryRateLimitStore } from '../rate-limit-store';

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('allows requests within the limit', async () => {
    const result = await store.check('key-1', 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('denies requests exceeding the limit', async () => {
    await store.check('key-2', 2, 60_000);
    await store.check('key-2', 2, 60_000);
    const result = await store.check('key-2', 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets after window expires', async () => {
    // Use a very short window (1ms)
    await store.check('key-3', 1, 1);
    await store.check('key-3', 1, 1);

    // Wait for the window to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait
    }

    const result = await store.check('key-3', 1, 1);
    expect(result.allowed).toBe(true);
  });

  it('disposes cleanup interval', () => {
    const s = new InMemoryRateLimitStore();
    s.dispose();
    s.dispose(); // double dispose is safe
  });

  it('tracks separate keys independently', async () => {
    await store.check('key-a', 1, 60_000);
    const result = await store.check('key-b', 1, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('cleans up expired entries during cleanup cycle', async () => {
    // Add an entry with a 1ms window (will expire nearly instantly)
    await store.check('cleanup-key', 1, 1);

    // Wait for the entry to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait
    }

    // Trigger cleanup by calling the private method via prototype trick
    // eslint-disable-next-line @typescript-eslint/no-explicit-method-signature
    (store as any).cleanup();

    // The expired entry should be cleaned up, so a new check should be allowed
    const result = await store.check('cleanup-key', 1, 1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('cleanup does not remove entries that have not expired', async () => {
    await store.check('still-active', 2, 60_000);

    // Trigger cleanup
    (store as any).cleanup();

    // Entry should still be counted
    const result = await store.check('still-active', 2, 60_000);
    expect(result.remaining).toBe(0);
  });

  it('returns resetAt in the result', async () => {
    const before = Date.now();
    const result = await store.check('key-reset', 5, 60_000);
    const after = Date.now();

    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 60_000);
  });

  it('decrements remaining correctly across multiple checks', async () => {
    const r1 = await store.check('key-dec', 3, 60_000);
    expect(r1.remaining).toBe(2);

    const r2 = await store.check('key-dec', 3, 60_000);
    expect(r2.remaining).toBe(1);

    const r3 = await store.check('key-dec', 3, 60_000);
    expect(r3.remaining).toBe(0);
    expect(r3.allowed).toBe(true);

    // Next should be denied
    const r4 = await store.check('key-dec', 3, 60_000);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });
});
