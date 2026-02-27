import { describe, expect, it } from 'bun:test';
import { createCodegenPipeline } from '../pipeline';
import type { CodegenIR } from '../types';

function makeIR(overrides: Partial<CodegenIR> = {}): CodegenIR {
  return {
    basePath: '/api/v1',
    modules: [],
    schemas: [],
    entities: [
      {
        entityName: 'tasks',
        operations: [
          {
            kind: 'list',
            method: 'GET',
            path: '/tasks',
            operationId: 'listTasks',
            outputSchema: 'TasksResponse',
            responseFields: [
              { name: 'id', tsType: 'string', optional: false },
              { name: 'title', tsType: 'string', optional: false },
            ],
          },
        ],
        actions: [],
      },
    ],
    auth: { schemes: [] },
    ...overrides,
  };
}

describe('createCodegenPipeline', () => {
  it('returns a pipeline with validate, generate, and resolveOutputDir methods', () => {
    const pipeline = createCodegenPipeline();

    expect(typeof pipeline.validate).toBe('function');
    expect(typeof pipeline.generate).toBe('function');
    expect(typeof pipeline.resolveOutputDir).toBe('function');
  });

  it('validate returns no errors for valid config', () => {
    const pipeline = createCodegenPipeline();
    const errors = pipeline.validate({ generators: ['typescript'] });

    expect(errors).toEqual([]);
  });

  it('validate returns errors for invalid config', () => {
    const pipeline = createCodegenPipeline();
    const errors = pipeline.validate({ generators: [] });

    expect(errors.length).toBeGreaterThan(0);
  });

  it('generate returns files for typescript generator', () => {
    const pipeline = createCodegenPipeline();
    const result = pipeline.generate(makeIR(), { generators: ['typescript'] });

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.generators).toContain('typescript');
  });

  it('resolveOutputDir returns default output dir when not specified', () => {
    const pipeline = createCodegenPipeline();
    const outputDir = pipeline.resolveOutputDir({ generators: ['typescript'] });

    expect(outputDir).toBe('.vertz/generated');
  });

  it('resolveOutputDir returns custom output dir when specified', () => {
    const pipeline = createCodegenPipeline();
    const outputDir = pipeline.resolveOutputDir({
      generators: ['typescript'],
      outputDir: 'custom/output',
    });

    expect(outputDir).toBe('custom/output');
  });
});
