import { beforeEach, describe, expect, it, vi, mock } from '@vertz/test';
import { type CliOptions, resolveOptions } from '../index.js';

// Mock the readline module for transitive dependency (prompts.ts imports node:readline).
// Note: vtz mock hoisting only works when the mock specifier matches an import
// in the SAME file. Since we import from '../index.js' (not node:readline directly),
// the mock isn't hoisted. This requires direct import of the mocked module.
// @ts-expect-error - unused import, needed for mock hoisting
import { createInterface } from 'node:readline';

vi.mock('node:readline', () => {
  const mockRl = {
    question: mock((_q, callback) => callback('test-project')),
    close: mock(),
  };

  return {
    createInterface: mock(() => mockRl),
    default: { createInterface: mock(() => mockRl) },
  };
});

// vtz runtime cannot mock node:* built-in modules — the interactive test
// relies on the readline mock, so skip it when running under vtz.
const isVtzRuntime = !!(globalThis as Record<string, unknown>).__vtz_runtime;
const canMockNodeBuiltins = !isVtzRuntime;

describe('prompts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    Object.assign(process.env, originalEnv);
  });

  describe('interactive mode', () => {
    it.skipIf(!canMockNodeBuiltins)('when project name is not provided: prompts for it', async () => {
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

  describe('template handling', () => {
    it('defaults to todo-app when no template is provided', async () => {
      const result = await resolveOptions({ projectName: 'my-app' });
      expect(result.template).toBe('todo-app');
    });

    it('accepts hello-world template', async () => {
      const result = await resolveOptions({ projectName: 'my-app', template: 'hello-world' });
      expect(result.template).toBe('hello-world');
    });

    it('accepts todo-app template', async () => {
      const result = await resolveOptions({ projectName: 'my-app', template: 'todo-app' });
      expect(result.template).toBe('todo-app');
    });

    it('accepts landing-page template', async () => {
      const result = await resolveOptions({ projectName: 'my-app', template: 'landing-page' });
      expect(result.template).toBe('landing-page');
    });

    it('throws InvalidTemplateError for unknown template', async () => {
      await expect(
        resolveOptions({ projectName: 'my-app', template: 'nonexistent' }),
      ).rejects.toThrow('Invalid template "nonexistent"');
    });

    it('InvalidTemplateError lists landing-page as available', async () => {
      await expect(
        resolveOptions({ projectName: 'my-app', template: 'nonexistent' }),
      ).rejects.toThrow('landing-page');
    });
  });
});
