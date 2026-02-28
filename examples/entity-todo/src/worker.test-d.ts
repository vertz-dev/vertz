/**
 * Type test: D1Database should be imported from @cloudflare/workers-types
 *
 * This test verifies that worker.ts can import D1Database
 * from @cloudflare/workers-types without type errors.
 */
import type { D1Database } from '@cloudflare/workers-types';

// Verify D1Database is a valid type
type Env = {
  DB: D1Database;
};

const _env: Env = {} as Env;
