import { describe, expect, it } from 'bun:test';
import { CircuitBreakerOpenError, createCircuitBreaker } from './circuit-breaker';

describe('createCircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = createCircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('executes the function and returns the result in closed state', async () => {
    const cb = createCircuitBreaker();
    const result = await cb.execute(async () => 42);
    expect(result).toBe(42);
  });

  it('opens after failureThreshold consecutive failures (default 5)', async () => {
    const cb = createCircuitBreaker();

    for (let i = 0; i < 5; i++) {
      await cb
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
    }

    expect(cb.getState()).toBe('open');
  });

  it('opens after custom failureThreshold consecutive failures', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await cb
        .execute(async () => {
          throw new Error('fail');
        })
        .catch(() => {});
    }

    expect(cb.getState()).toBe('open');
  });

  it('rejects immediately with CircuitBreakerOpenError when open', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});

    expect(cb.getState()).toBe('open');

    let caught: unknown;
    try {
      await cb.execute(async () => 'should not run');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CircuitBreakerOpenError);
    expect((caught as Error).message).toBe('Circuit breaker is open');
  });

  it('resets consecutive failure count on success', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 3 });

    // 2 failures
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});

    // 1 success resets the count
    await cb.execute(async () => 'ok');

    // 2 more failures should not trip (3 total failures, but not consecutive)
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});

    expect(cb.getState()).toBe('closed');
  });

  it('transitions to half-open after resetTimeout elapses', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 50 });
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});

    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));

    expect(cb.getState()).toBe('half-open');
  });

  it('allows one probe request in half-open state', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 10 });
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 20));

    expect(cb.getState()).toBe('half-open');

    // Probe succeeds → closed
    const result = await cb.execute(async () => 'probe-ok');
    expect(result).toBe('probe-ok');
    expect(cb.getState()).toBe('closed');
  });

  it('rejects concurrent requests during half-open probe', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 10 });
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 20));

    expect(cb.getState()).toBe('half-open');

    // Start a slow probe
    const slowProbe = cb.execute(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return 'probe-ok';
    });

    // Second request during probe should be rejected
    let caught: unknown;
    try {
      await cb.execute(async () => 'should-not-run');
    } catch (e) {
      caught = e;
    }

    expect(caught).toBeInstanceOf(CircuitBreakerOpenError);

    // Wait for probe to complete
    await slowProbe;
    expect(cb.getState()).toBe('closed');
  });

  it('returns to open when probe fails in half-open state', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1, resetTimeout: 10 });
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 20));

    expect(cb.getState()).toBe('half-open');

    // Probe fails → back to open
    await cb
      .execute(async () => {
        throw new Error('probe-fail');
      })
      .catch(() => {});
    expect(cb.getState()).toBe('open');
  });

  it('reset() returns to closed state with zero failures', async () => {
    const cb = createCircuitBreaker({ failureThreshold: 1 });
    await cb
      .execute(async () => {
        throw new Error('fail');
      })
      .catch(() => {});
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');

    // Should be able to execute again
    const result = await cb.execute(async () => 'after-reset');
    expect(result).toBe('after-reset');
  });

  it('propagates the original error from the function', async () => {
    const cb = createCircuitBreaker();
    const originalError = new Error('specific error');

    let caught: unknown;
    try {
      await cb.execute(async () => {
        throw originalError;
      });
    } catch (e) {
      caught = e;
    }

    expect(caught).toBe(originalError);
  });

  it('preserves generic type T from callback return type', async () => {
    const cb = createCircuitBreaker();

    const str: string = await cb.execute(async () => 'hello');
    expect(str).toBe('hello');

    const num: number = await cb.execute(async () => 42);
    expect(num).toBe(42);

    const obj: { name: string } = await cb.execute(async () => ({ name: 'test' }));
    expect(obj.name).toBe('test');
  });
});
