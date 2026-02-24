import { afterEach, describe, expect, it, vi } from 'bun:test';
import { isCI, requireParam } from '../prompt';

describe('isCI', () => {
  function clearCIEnv(): void {
    delete process.env.CI;
    delete process.env.CONTINUOUS_INTEGRATION;
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITLAB_CI;
  }

  afterEach(() => {
    clearCIEnv();
  });

  it('returns false when no CI env vars are set', () => {
    clearCIEnv();
    expect(isCI()).toBe(false);
  });

  it('returns true when CI=true', () => {
    clearCIEnv();
    process.env.CI = 'true';
    expect(isCI()).toBe(true);
  });

  it('returns true when CI=1', () => {
    clearCIEnv();
    process.env.CI = '1';
    expect(isCI()).toBe(true);
  });

  it('returns true when GITHUB_ACTIONS=true', () => {
    clearCIEnv();
    process.env.GITHUB_ACTIONS = 'true';
    expect(isCI()).toBe(true);
  });

  it('returns true when GITLAB_CI=true', () => {
    clearCIEnv();
    process.env.GITLAB_CI = 'true';
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
