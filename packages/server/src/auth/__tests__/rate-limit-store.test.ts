import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { InMemoryRateLimitStore } from '../rate-limit-store';

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    store = new InMemoryRateLimitStore();
  });

  afterEach(() => {
    store.dispose();
  });

  it('allows requests within the limit', () => {
    const result = store.check('key-1', 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('denies requests exceeding the limit', () => {
    store.check('key-2', 2, 60_000);
    store.check('key-2', 2, 60_000);
    const result = store.check('key-2', 2, 60_000);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('resets after window expires', () => {
    // Use a very short window (1ms)
    store.check('key-3', 1, 1);
    store.check('key-3', 1, 1);

    // Wait for the window to expire
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait
    }

    const result = store.check('key-3', 1, 1);
    expect(result.allowed).toBe(true);
  });

  it('disposes cleanup interval', () => {
    const s = new InMemoryRateLimitStore();
    s.dispose();
    s.dispose(); // double dispose is safe
  });

  it('tracks separate keys independently', () => {
    store.check('key-a', 1, 60_000);
    const result = store.check('key-b', 1, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it('returns resetAt in the result', () => {
    const before = Date.now();
    const result = store.check('key-reset', 5, 60_000);
    const after = Date.now();

    expect(result.resetAt).toBeInstanceOf(Date);
    expect(result.resetAt.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt.getTime()).toBeLessThanOrEqual(after + 60_000);
  });

  it('decrements remaining correctly across multiple checks', () => {
    const r1 = store.check('key-dec', 3, 60_000);
    expect(r1.remaining).toBe(2);

    const r2 = store.check('key-dec', 3, 60_000);
    expect(r2.remaining).toBe(1);

    const r3 = store.check('key-dec', 3, 60_000);
    expect(r3.remaining).toBe(0);
    expect(r3.allowed).toBe(true);

    // Next should be denied
    const r4 = store.check('key-dec', 3, 60_000);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });
});
