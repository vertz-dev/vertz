/**
 * Build Command Tests
 *
 * Tests for the vertz build CLI command
 * Verifies that buildAction returns proper exit codes instead of calling process.exit
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('buildAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should export buildAction function', { timeout: 15_000 }, async () => {
    const { buildAction } = await import('../build');
    expect(buildAction).toBeDefined();
    expect(typeof buildAction).toBe('function');
  });

  it('should be an async function that returns a number', { timeout: 15_000 }, async () => {
    const { buildAction } = await import('../build');
    const result = buildAction({ noTypecheck: true });

    // Verify it returns a Promise
    expect(result).toBeInstanceOf(Promise);

    // Verify the resolved value is a number (exit code)
    const exitCode = await result;
    expect(typeof exitCode).toBe('number');
  });
});
