export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): 'closed' | 'open' | 'half-open';
  reset(): void;
}

export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitBreakerOpenError';
  }
}

export function createCircuitBreaker(options?: {
  failureThreshold?: number;
  resetTimeout?: number;
}): CircuitBreaker {
  const threshold = options?.failureThreshold ?? 5;
  const resetTimeout = options?.resetTimeout ?? 10_000;

  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let consecutiveFailures = 0;
  let openedAt = 0;
  let halfOpenProbeInFlight = false;

  function checkHalfOpenTransition() {
    if (state === 'open' && Date.now() - openedAt >= resetTimeout) {
      state = 'half-open';
    }
  }

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      checkHalfOpenTransition();

      if (state === 'open') {
        throw new CircuitBreakerOpenError();
      }

      // Half-open: only one probe request at a time
      if (state === 'half-open') {
        if (halfOpenProbeInFlight) {
          throw new CircuitBreakerOpenError();
        }
        halfOpenProbeInFlight = true;
      }

      try {
        const result = await fn();
        consecutiveFailures = 0;
        if (state === 'half-open') {
          state = 'closed';
          halfOpenProbeInFlight = false;
        }
        return result;
      } catch (error) {
        consecutiveFailures++;
        if (state === 'half-open') {
          state = 'open';
          openedAt = Date.now();
          halfOpenProbeInFlight = false;
        } else if (consecutiveFailures >= threshold) {
          state = 'open';
          openedAt = Date.now();
        }
        throw error;
      }
    },

    getState() {
      checkHalfOpenTransition();
      return state;
    },

    reset() {
      state = 'closed';
      consecutiveFailures = 0;
      openedAt = 0;
      halfOpenProbeInFlight = false;
    },
  };
}
