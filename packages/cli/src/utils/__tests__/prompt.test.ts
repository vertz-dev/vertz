import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCI, requireParam } from '../prompt';

describe('isCI', () => {
  function clearCIEnv(): void {
    vi.stubEnv('CI', '');
    vi.stubEnv('CONTINUOUS_INTEGRATION', '');
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('GITLAB_CI', '');
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when no CI env vars are set', () => {
    clearCIEnv();
    expect(isCI()).toBe(false);
  });

  it('returns true when CI=true', () => {
    clearCIEnv();
    vi.stubEnv('CI', 'true');
    expect(isCI()).toBe(true);
  });

  it('returns true when CI=1', () => {
    clearCIEnv();
    vi.stubEnv('CI', '1');
    expect(isCI()).toBe(true);
  });

  it('returns true when GITHUB_ACTIONS=true', () => {
    clearCIEnv();
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(isCI()).toBe(true);
  });

  it('returns true when GITLAB_CI=true', () => {
    clearCIEnv();
    vi.stubEnv('GITLAB_CI', 'true');
    expect(isCI()).toBe(true);
  });
});

describe('requireParam', () => {
  it('returns the value when present', () => {
    expect(requireParam('hello', 'name')).toBe('hello');
  });

  it('throws when value is undefined', () => {
    expect(() => requireParam(undefined, 'name')).toThrow('Missing required parameter: name');
  });

  it('throws when value is empty string', () => {
    expect(() => requireParam('', 'name')).toThrow('Missing required parameter: name');
  });
});
