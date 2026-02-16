/**
 * Deno runtime adapter for integration tests.
 *
 * This adapter cannot be tested from the Bun or Vitest test runners because
 * Deno.serve is only available in the Deno runtime. It will be exercised
 * when integration tests run under Deno via `deno task test`.
 */
import type { RuntimeAdapter } from './types';
export declare const denoAdapter: RuntimeAdapter;
export declare const adapter: RuntimeAdapter;
//# sourceMappingURL=deno.d.ts.map
