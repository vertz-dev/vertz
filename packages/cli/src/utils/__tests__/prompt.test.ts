import { afterEach, describe, expect, it, vi } from 'vitest';
import { isCI, requireParam } from '../prompt';

describe('isCI', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when no CI env vars are set', () => {
    vi.stubEnv('CI', '');
    vi.stubEnv('CONTINUOUS_INTEGRATION', '');
    vi.stubEnv('GITHUB_ACTIONS', '');
    vi.stubEnv('GITLAB_CI', '');
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

  it('returns true when GITHUB_ACTIONS=true', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    expect(isCI()).toBe(true);
  });

  it('returns true when GITLAB_CI=true', () => {
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
