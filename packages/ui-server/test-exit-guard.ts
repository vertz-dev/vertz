/**
 * Preload script that force-exits the bun test process after all tests
 * complete. This works around a Bun issue on Linux CI runners where
 * open handles (from module imports, mocked servers, etc.) prevent
 * the process from exiting after tests finish.
 */
import { afterAll } from 'bun:test';

afterAll(() => {
  // Give bun test a moment to flush output, then force exit
  setTimeout(() => process.exit(0), 500);
});
