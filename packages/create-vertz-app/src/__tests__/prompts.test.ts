import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type CliOptions, resolveOptions } from '../index.js';

// Mock the readline module
vi.mock('readline', () => {
  const mockRl = {
    question: vi.fn((_: string, callback: (answer: string) => void) => callback('test-project')),
    close: vi.fn(),
  };

  return {
    createInterface: vi.fn(() => mockRl),
    default: { createInterface: vi.fn(() => mockRl) },
  };
});

describe('prompts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
  });

  describe('interactive mode', () => {
    it('when project name is not provided: prompts for it', async () => {
      delete process.env.CI;

      const options: Partial<CliOptions> = {};

      const result = await resolveOptions(options);
      expect(result.projectName).toBe('test-project');
    });
  });

  describe('CI mode', () => {
    beforeEach(() => {
      process.env.CI = 'true';
    });

    it('when CI=true and project name is not provided: exits with error', async () => {
      const options: Partial<CliOptions> = {};

      await expect(resolveOptions(options)).rejects.toThrow('Project name is required in CI mode');
    });

    it('when CI=true: uses flag values (no prompts)', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'ci-app',
      };

      const result = await resolveOptions(options);
      expect(result.projectName).toBe('ci-app');
    });
  });

  describe('flag handling', () => {
    it('uses provided project name without prompting', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'my-app',
      };

      const result = await resolveOptions(options);
      expect(result.projectName).toBe('my-app');
    });
  });
});
