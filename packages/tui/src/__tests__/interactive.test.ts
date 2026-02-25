import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInteractive, NonInteractiveError } from '../interactive';
import { prompt } from '../prompt';

describe('isInteractive', () => {
  const originalCI = process.env.CI;

  afterEach(() => {
    if (originalCI !== undefined) {
      process.env.CI = originalCI;
    } else {
      delete process.env.CI;
    }
  });

  it('returns false when CI env var is set', () => {
    process.env.CI = 'true';
    expect(isInteractive()).toBe(false);
  });

  it('returns false when CI env var is "1"', () => {
    process.env.CI = '1';
    expect(isInteractive()).toBe(false);
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
