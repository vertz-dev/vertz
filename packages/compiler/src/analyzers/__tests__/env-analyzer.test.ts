import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { resolveConfig } from '../../config';
import type { EnvIR, EnvVariableIR } from '../../ir/types';
import { EnvAnalyzer } from '../env-analyzer';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

describe('EnvAnalyzer', () => {
  it('discovers vertz.env() call with load and schema', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
const envSchema = {};
export const env = vertz.env({ load: ['.env', '.env.local'], schema: envSchema });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env).toBeDefined();
    expect(result.env!.loadFiles).toEqual(['.env', '.env.local']);
  });

  it('returns undefined env when no vertz.env() call exists', async () => {
    const project = createProject();
    project.createSourceFile('src/app.ts', `export const app = 'hello';`);
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env).toBeUndefined();
  });

  it('extracts source location of vertz.env() call', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
const envSchema = {};
export const env = vertz.env({ load: [], schema: envSchema });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env!.sourceLine).toBe(3);
  });

  it('extracts empty load array', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
const envSchema = {};
export const env = vertz.env({ load: [], schema: envSchema });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env!.loadFiles).toEqual([]);
  });

  it('extracts multiple load file paths', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
const envSchema = {};
export const env = vertz.env({ load: ['.env', '.env.local', '.env.production'], schema: envSchema });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env!.loadFiles).toEqual(['.env', '.env.local', '.env.production']);
  });

  it('defaults to empty load array when load property is absent', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
const envSchema = {};
export const env = vertz.env({ schema: envSchema });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env!.loadFiles).toEqual([]);
  });

  it('extracts schema reference from named identifier', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.schema.ts',
      `export const envSchema = {};`,
    );
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
import { envSchema } from './env.schema';
export const env = vertz.env({ load: ['.env'], schema: envSchema });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env!.schema).toBeDefined();
    expect(result.env!.schema!.kind).toBe('named');
    if (result.env!.schema!.kind === 'named') {
      expect(result.env!.schema!.schemaName).toBe('envSchema');
    }
  });

  it('schema is undefined when schema property is absent', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
export const env = vertz.env({ load: ['.env'] });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.env!.schema).toBeUndefined();
  });

  it('emits error when multiple vertz.env() calls exist', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
export const env1 = vertz.env({ load: ['.env'] });
export const env2 = vertz.env({ load: ['.env.local'] });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.severity).toBe('error');
    expect(diags[0]!.code).toBe('VERTZ_ENV_DUPLICATE');
  });

  it('emits no diagnostics for valid single env definition', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/env.ts',
      `import { vertz } from '@vertz/core';
export const env = vertz.env({ load: ['.env'] });`,
    );
    const analyzer = new EnvAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    expect(analyzer.getDiagnostics()).toHaveLength(0);
  });
});

describe('type-level tests', () => {
  it('EnvIR requires loadFiles', () => {
    // @ts-expect-error — EnvIR without loadFiles should be rejected
    const bad: EnvIR = {
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
      variables: [],
    };
    expect(bad).toBeDefined();
  });

  it('EnvVariableIR requires all fields', () => {
    // @ts-expect-error — EnvVariableIR without 'required' should be rejected
    const bad: EnvVariableIR = {
      name: 'PORT',
      type: 'number',
      hasDefault: true,
    };
    expect(bad).toBeDefined();
  });
});
