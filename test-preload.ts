/**
 * Test preload — polyfills vitest-compatible APIs not yet available in Bun's test runner.
 *
 * vi.hoisted(fn) — In vitest/vtz, this hoists the factory above imports so mock
 * variables are available in vi.mock() factories. In Bun, vi.mock() is not hoisted,
 * so vi.hoisted() just calls the factory inline (identity behavior).
 *
 * vi.mock(specifier, factory) — Bun supports this natively since v1.1.x as an alias
 * for mock.module(). No polyfill needed.
 */
import { vi } from '@vertz/test';

if (typeof vi.hoisted !== 'function') {
  // @ts-expect-error — extending vi with vitest-compatible hoisted()
  vi.hoisted = <T>(factory: () => T): T => factory();
}
