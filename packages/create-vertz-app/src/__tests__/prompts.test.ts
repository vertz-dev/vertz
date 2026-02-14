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
    // Save and restore env
    Object.assign(process.env, originalEnv);
    vi.restoreAllMocks();
  });

  describe('interactive mode', () => {
    it('when project name is not provided: prompts for it', async () => {
      delete process.env.CI;

      const options: Partial<CliOptions> = {
        runtime: 'bun',
        includeExample: true,
      };

      const result = await resolveOptions(options);
      expect(result.projectName).toBe('test-project');
    });

    it('prompts for runtime selection (Bun, Node, Deno)', async () => {
      delete process.env.CI;

      const options: Partial<CliOptions> = {
        projectName: 'my-app',
      };

      const result = await resolveOptions(options);
      // Should default to bun in interactive mode
      expect(['bun', 'node', 'deno']).toContain(result.runtime);
    });

    it('Bun is the default/recommended option', async () => {
      delete process.env.CI;

      const options: Partial<CliOptions> = {
        projectName: 'my-app',
      };

      const result = await resolveOptions(options);
      expect(result.runtime).toBe('bun');
    });

    it('prompts for example module inclusion (default: yes)', async () => {
      delete process.env.CI;

      const options: Partial<CliOptions> = {
        projectName: 'my-app',
        runtime: 'bun',
      };

      const result = await resolveOptions(options);
      expect(result.includeExample).toBe(true);
    });
  });

  describe('CI mode', () => {
    beforeEach(() => {
      process.env.CI = 'true';
    });

    it('when CI=true and project name is not provided: exits with error', async () => {
      const options: Partial<CliOptions> = {
        runtime: 'bun',
      };

      await expect(resolveOptions(options)).rejects.toThrow('Project name is required in CI mode');
    });

    it('when CI=true: uses flag values or defaults (no prompts)', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'ci-app',
        runtime: 'bun',
        includeExample: false,
      };

      const result = await resolveOptions(options);
      expect(result.projectName).toBe('ci-app');
      expect(result.runtime).toBe('bun');
      expect(result.includeExample).toBe(false);
    });

    it('--runtime bun skips the runtime prompt', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'test-app',
        runtime: 'bun',
      };

      const result = await resolveOptions(options);
      expect(result.runtime).toBe('bun');
    });

    it('--example enables example module without prompting', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: true,
      };

      const result = await resolveOptions(options);
      expect(result.includeExample).toBe(true);
    });

    it('--no-example disables example module without prompting', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'test-app',
        runtime: 'bun',
        includeExample: false,
      };

      const result = await resolveOptions(options);
      expect(result.includeExample).toBe(false);
    });
  });

  describe('flag handling', () => {
    it('--runtime accepts bun, node, deno', async () => {
      const runtimes = ['bun', 'node', 'deno'] as const;

      for (const runtime of runtimes) {
        const options: Partial<CliOptions> = {
          projectName: 'test-app',
          runtime,
        };

        const result = await resolveOptions(options);
        expect(result.runtime).toBe(runtime);
      }
    });

    it('--runtime with invalid value shows error and valid options', async () => {
      const options: Partial<CliOptions> = {
        projectName: 'test-app',
        runtime: 'invalid' as 'bun',
      };

      await expect(resolveOptions(options)).rejects.toThrow('Invalid runtime');
    });
  });
});
