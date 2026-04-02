import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { runCLI } from '../cli';

const tmpDir = join(import.meta.dir, '__tmp_cli_test__');

function writeSpec(filename: string, spec: Record<string, unknown>): string {
  mkdirSync(tmpDir, { recursive: true });
  const filePath = join(tmpDir, filename);
  writeFileSync(filePath, JSON.stringify(spec));
  return filePath;
}

const minimalSpec = {
  openapi: '3.0.3',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {
    '/tasks': {
      get: {
        operationId: 'listTasks',
        tags: ['tasks'],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { type: 'object', properties: { id: { type: 'string' } } },
                },
              },
            },
          },
        },
      },
    },
  },
};

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('CLI', () => {
  describe('generate command', () => {
    it('generates SDK files from a spec file', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI(['generate', '--from', specPath, '--output', outputDir]);

      expect(result.exitCode).toBe(0);
      expect(result.message).toContain('Generated');
      expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
    });

    it('accepts --output flag', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'custom-output');

      await runCLI(['generate', '--from', specPath, '--output', outputDir]);

      expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
    });

    it('accepts --dry-run flag — no files written', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI([
        'generate',
        '--from',
        specPath,
        '--output',
        outputDir,
        '--dry-run',
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.message).toContain('dry run');
      expect(existsSync(outputDir)).toBe(false);
    });

    it('accepts --schemas flag', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      await runCLI(['generate', '--from', specPath, '--output', outputDir, '--schemas']);

      expect(existsSync(join(outputDir, 'schemas/tasks.ts'))).toBe(true);
    });

    it('accepts --base-url flag', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI([
        'generate',
        '--from',
        specPath,
        '--output',
        outputDir,
        '--base-url',
        'https://api.example.com',
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('accepts --group-by flag', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI([
        'generate',
        '--from',
        specPath,
        '--output',
        outputDir,
        '--group-by',
        'path',
      ]);

      expect(result.exitCode).toBe(0);
    });

    it('accepts --exclude-tags flag with comma-separated tags', async () => {
      const spec = {
        openapi: '3.0.3',
        info: { title: 'Test', version: '1.0.0' },
        paths: {
          '/tasks': {
            get: {
              operationId: 'listTasks',
              tags: ['tasks'],
              responses: {
                '200': { content: { 'application/json': { schema: { type: 'object' } } } },
              },
            },
          },
          '/debug': {
            get: {
              operationId: 'getDebug',
              tags: ['internal'],
              responses: {
                '200': { content: { 'application/json': { schema: { type: 'object' } } } },
              },
            },
          },
        },
      };
      const specPath = writeSpec('spec.json', spec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI([
        'generate',
        '--from',
        specPath,
        '--output',
        outputDir,
        '--exclude-tags',
        'internal,deprecated',
      ]);

      expect(result.exitCode).toBe(0);
      expect(existsSync(join(outputDir, 'resources/tasks.ts'))).toBe(true);
      expect(existsSync(join(outputDir, 'resources/internal.ts'))).toBe(false);
    });

    it('prints summary with written/skipped counts', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI(['generate', '--from', specPath, '--output', outputDir]);

      expect(result.message).toMatch(/\d+ written/);
    });

    it('exits with code 1 on error', async () => {
      const result = await runCLI([
        'generate',
        '--from',
        '/nonexistent/spec.json',
        '--output',
        join(tmpDir, 'output'),
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Error');
    });

    it('exits with code 1 when --from is missing and no config file', async () => {
      const result = await runCLI(['generate', '--output', join(tmpDir, 'output')], tmpDir);

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('source');
    });
  });

  describe('validate command', () => {
    it('validates a spec without generating', async () => {
      const specPath = writeSpec('spec.json', minimalSpec);
      const outputDir = join(tmpDir, 'output');

      const result = await runCLI(['validate', '--from', specPath]);

      expect(result.exitCode).toBe(0);
      expect(result.message).toContain('valid');
      expect(existsSync(outputDir)).toBe(false);
    });

    it('exits with code 1 when --from is missing', async () => {
      const result = await runCLI(['validate']);

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Missing --from');
    });

    it('reports errors for invalid spec', async () => {
      const specPath = writeSpec('bad.json', { invalid: true });

      const result = await runCLI(['validate', '--from', specPath]);

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Error');
    });
  });

  describe('unknown command', () => {
    it('prints error for unknown command', async () => {
      const result = await runCLI(['unknown']);

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Unknown command');
    });

    it('prints usage when no command given', async () => {
      const result = await runCLI([]);

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain('Usage');
    });
  });
});
