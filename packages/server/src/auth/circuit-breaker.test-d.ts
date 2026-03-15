import { expectTypeOf } from 'expect-type';
import type { CircuitBreaker } from './circuit-breaker';
import { createCircuitBreaker } from './circuit-breaker';

// createCircuitBreaker returns CircuitBreaker
const cb = createCircuitBreaker();
expectTypeOf(cb).toMatchTypeOf<CircuitBreaker>();

// execute<T> preserves the callback return type
expectTypeOf(cb.execute(async () => 'hello')).toEqualTypeOf<Promise<string>>();
expectTypeOf(cb.execute(async () => 42)).toEqualTypeOf<Promise<number>>();
expectTypeOf(cb.execute(async () => ({ id: '1' }))).toEqualTypeOf<Promise<{ id: string }>>();

// getState returns the union of three states
expectTypeOf(cb.getState()).toEqualTypeOf<'closed' | 'open' | 'half-open'>();

// reset returns void
expectTypeOf(cb.reset()).toEqualTypeOf<void>();
