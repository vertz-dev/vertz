import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { type CliOptions, resolveOptions } from '../index.js';

// Mock the readline module
mock.module('readline', () => {
  const mockRl = {
    question: mock((_: string, callback: (answer: string) => void) => callback('test-project')),
    close: mock(),
  };

  return {
    createInterface: mock(() => mockRl),
    default: { createInterface: mock(() => mockRl) },
  };
});

describe('prompts', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    Object.assign(process.env, originalEnv);
    mock.restore();
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

    it('throws InvalidTemplateError for unknown template', async () => {
      await expect(
        resolveOptions({ projectName: 'my-app', template: 'nonexistent' }),
      ).rejects.toThrow('Invalid template "nonexistent"');
    });
  });
});
