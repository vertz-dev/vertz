import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCI } from '../prompt.js';

describe('isCI', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when CI env var is not set', () => {
    vi.stubEnv('CI', '');
    expect(isCI()).toBe(false);
  });

  it('returns true when CI=true', () => {
    vi.stubEnv('CI', 'true');
    expect(isCI()).toBe(true);
  });

  it('returns true when CI=1', () => {
    vi.stubEnv('CI', '1');
    expect(isCI()).toBe(true);
  });

  it('returns false when CI=false', () => {
    vi.stubEnv('CI', 'false');
    expect(isCI()).toBe(false);
  });

  it('returns false when CI=0', () => {
    vi.stubEnv('CI', '0');
    expect(isCI()).toBe(false);
  });
});
