// Circuit breaker — Phase 2 implementation.
// Phase 1 exports only the type interface.

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): 'closed' | 'open' | 'half-open';
  reset(): void;
}
