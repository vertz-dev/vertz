import { afterEach, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { generateFromOpenAPI } from '../generate';

const tmpDir = join(import.meta.dir, '__tmp_generate_test__');

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
                  items: {
                    type: 'object',
                    properties: { id: { type: 'string' }, title: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'createTask',
        tags: ['tasks'],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { title: { type: 'string' } },
                required: ['title'],
              },
            },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { id: { type: 'string' }, title: { type: 'string' } },
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

describe('generateFromOpenAPI', () => {
  it('runs the full pipeline: spec → parse → group → generate → write', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    const result = await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'tag',
      schemas: false,
    });

    expect(result.written).toBeGreaterThan(0);
    expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'types/tasks.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'resources/tasks.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'README.md'))).toBe(true);
  });

  it('passes schemas option through to generators', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'tag',
      schemas: true,
    });

    expect(existsSync(join(outputDir, 'schemas/tasks.ts'))).toBe(true);
    const content = readFileSync(join(outputDir, 'schemas/tasks.ts'), 'utf-8');
    expect(content).toContain('import { z }');
  });

  it('passes baseURL through to client generator', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: 'https://api.example.com',
      groupBy: 'tag',
      schemas: false,
    });

    const content = readFileSync(join(outputDir, 'client.ts'), 'utf-8');
    expect(content).toContain('https://api.example.com');
  });

  it('passes dryRun through to writer — no files written', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    const result = await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'tag',
      schemas: false,
      dryRun: true,
    });

    expect(result.written).toBeGreaterThan(0);
    expect(existsSync(outputDir)).toBe(false);
  });

  it('applies groupBy strategy', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'path',
      schemas: false,
    });

    // With path grouping, the resource key comes from path segments
    expect(existsSync(join(outputDir, 'resources/tasks.ts'))).toBe(true);
  });

  it('applies operationIds overrides', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'tag',
      schemas: false,
      operationIds: {
        overrides: { listTasks: 'fetchAll' },
      },
    });

    const content = readFileSync(join(outputDir, 'resources/tasks.ts'), 'utf-8');
    expect(content).toContain('fetchAll');
  });

  it('applies operationIds transform', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'tag',
      schemas: false,
      operationIds: {
        transform: (cleaned) => `my${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}`,
      },
    });

    const content = readFileSync(join(outputDir, 'resources/tasks.ts'), 'utf-8');
    expect(content).toContain('myList');
  });

  it('returns WriteResult with correct counts', async () => {
    const specPath = writeSpec('spec.json', minimalSpec);
    const outputDir = join(tmpDir, 'output');

    const result = await generateFromOpenAPI({
      source: specPath,
      output: outputDir,
      baseURL: '',
      groupBy: 'tag',
      schemas: false,
    });

    expect(result.written).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
    expect(result.filesWritten.length).toBe(result.written);
  });

  it('propagates errors from loader for missing spec', async () => {
    await expect(
      generateFromOpenAPI({
        source: '/nonexistent/spec.json',
        output: join(tmpDir, 'output'),
        baseURL: '',
        groupBy: 'tag',
        schemas: false,
      }),
    ).rejects.toThrow('not found');
  });

  it('propagates errors from parser for invalid spec', async () => {
    const specPath = writeSpec('bad.json', { invalid: true });

    await expect(
      generateFromOpenAPI({
        source: specPath,
        output: join(tmpDir, 'output'),
        baseURL: '',
        groupBy: 'tag',
        schemas: false,
      }),
    ).rejects.toThrow('missing required field');
  });
});
