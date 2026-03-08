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
});
