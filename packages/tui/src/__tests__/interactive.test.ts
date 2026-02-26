import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isInteractive, NonInteractiveError } from '../interactive';
import { prompt } from '../prompt';

const CI_ENV_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'JENKINS_URL',
  'BUILD_NUMBER',
  'BUILDKITE',
  'CODEBUILD_BUILD_ID',
  'TF_BUILD',
] as const;

describe('isInteractive', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const v of CI_ENV_VARS) {
      saved[v] = process.env[v];
    }
  });

  afterEach(() => {
    for (const v of CI_ENV_VARS) {
      if (saved[v] !== undefined) {
        process.env[v] = saved[v];
      } else {
        delete process.env[v];
      }
    }
  });

  function clearAllCI(): void {
    for (const v of CI_ENV_VARS) {
      delete process.env[v];
    }
  }

  it('returns false when CI env var is set', () => {
    clearAllCI();
    process.env.CI = 'true';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when CI env var is "1"', () => {
    clearAllCI();
    process.env.CI = '1';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when GITHUB_ACTIONS is set', () => {
    clearAllCI();
    process.env.GITHUB_ACTIONS = 'true';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when GITLAB_CI is set', () => {
    clearAllCI();
    process.env.GITLAB_CI = 'true';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when JENKINS_URL is set', () => {
    clearAllCI();
    process.env.JENKINS_URL = 'http://jenkins.local';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when BUILD_NUMBER is set', () => {
    clearAllCI();
    process.env.BUILD_NUMBER = '42';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when BUILDKITE is set', () => {
    clearAllCI();
    process.env.BUILDKITE = 'true';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when stdin.isTTY is false (without CI env var)', () => {
    clearAllCI();
    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    try {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
      expect(isInteractive()).toBe(false);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: originalStdinIsTTY,
        configurable: true,
      });
      Object.defineProperty(process.stdout, 'isTTY', {
        value: originalStdoutIsTTY,
        configurable: true,
      });
    }
  });
});

describe('prompt CI mode', () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it('prompt.text resolves with default in non-interactive mode', async () => {
    process.env.CI = 'true';
    const value = await prompt.text({ message: 'Name?', default: 'my-app' });
    expect(value).toBe('my-app');
  });

  it('prompt.text throws NonInteractiveError without default', async () => {
    process.env.CI = 'true';
    await expect(prompt.text({ message: 'Name?' })).rejects.toThrow(NonInteractiveError);
  });

  it('prompt.select resolves with default in non-interactive mode', async () => {
    process.env.CI = 'true';
    const value = await prompt.select({
      message: 'Runtime?',
      options: [
        { label: 'Bun', value: 'bun' },
        { label: 'Node', value: 'node' },
      ],
      default: 'bun',
    });
    expect(value).toBe('bun');
  });

  it('prompt.select throws NonInteractiveError without default', async () => {
    process.env.CI = 'true';
    await expect(
      prompt.select({
        message: 'Runtime?',
        options: [{ label: 'Bun', value: 'bun' }],
      }),
    ).rejects.toThrow(NonInteractiveError);
  });

  it('prompt.confirm resolves with default in non-interactive mode', async () => {
    process.env.CI = 'true';
    const value = await prompt.confirm({ message: 'Continue?', default: true });
    expect(value).toBe(true);
  });

  it('prompt.confirm throws NonInteractiveError without default', async () => {
    process.env.CI = 'true';
    await expect(prompt.confirm({ message: 'Continue?' })).rejects.toThrow(NonInteractiveError);
  });

  it('prompt.multiSelect resolves with defaultValue in non-interactive mode', async () => {
    process.env.CI = 'true';
    const values = await prompt.multiSelect({
      message: 'Features?',
      options: [
        { label: 'Auth', value: 'auth' },
        { label: 'DB', value: 'db' },
      ],
      defaultValue: ['auth'],
    });
    expect(values).toEqual(['auth']);
  });

  it('prompt.password throws NonInteractiveError without default', async () => {
    process.env.CI = 'true';
    await expect(prompt.password({ message: 'Token?' })).rejects.toThrow(NonInteractiveError);
  });

  it('spinner degrades to static log lines in CI', () => {
    process.env.CI = 'true';
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const s = prompt.spinner();
    s.start('Building...');
    s.stop('Done');
    const output = writeSpy.mock.calls.map((c) => c[0]).join('');
    expect(output).toContain('Building...');
    expect(output).toContain('Done');
    writeSpy.mockRestore();
  });
});
