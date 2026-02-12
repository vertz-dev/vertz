import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import type { Diagnostic } from '../../errors';
import type { MiddlewareIR } from '../../ir/types';
import type { MiddlewareAnalyzerResult } from '../middleware-analyzer';
import { MiddlewareAnalyzer } from '../middleware-analyzer';

const _sharedProject = new Project({ useInMemoryFileSystem: true });

function createProject() {
  for (const file of _sharedProject.getSourceFiles()) {
    file.deleteImmediatelySync();
  }
  return _sharedProject;
}

describe('MiddlewareAnalyzer', () => {
  it('extracts middleware name from the name property', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const auth = vertz.middleware({ name: 'auth', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(1);
    expect(result.middleware.at(0)?.name).toBe('auth');
  });

  it('extracts source location', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
// comment
const auth = vertz.middleware({ name: 'auth', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.sourceLine).toBe(3);
    expect(result.middleware.at(0)?.sourceFile).toContain('auth.ts');
  });

  it('extracts inject references', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const auth = vertz.middleware({ name: 'auth', inject: { tokenService, userService }, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.inject).toHaveLength(2);
    expect(result.middleware.at(0)?.inject[0]).toEqual({
      localName: 'tokenService',
      resolvedToken: 'tokenService',
    });
    expect(result.middleware.at(0)?.inject[1]).toEqual({
      localName: 'userService',
      resolvedToken: 'userService',
    });
  });

  it('extracts headers schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const authHeaders = {};
const auth = vertz.middleware({ name: 'auth', headers: authHeaders, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.headers).toBeDefined();
    expect(result.middleware.at(0)?.headers?.kind).toBe('named');
    if (result.middleware.at(0)?.headers?.kind === 'named') {
      expect(result.middleware.at(0)?.headers?.schemaName).toBe('authHeaders');
    }
  });

  it('extracts params schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/validate.ts',
      `import { vertz } from '@vertz/core';
const validateParams = {};
const validate = vertz.middleware({ name: 'validate', params: validateParams, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.params).toBeDefined();
    expect(result.middleware.at(0)?.params?.kind).toBe('named');
    if (result.middleware.at(0)?.params?.kind === 'named') {
      expect(result.middleware.at(0)?.params?.schemaName).toBe('validateParams');
    }
  });

  it('extracts query schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/paginate.ts',
      `import { vertz } from '@vertz/core';
const paginationQuery = {};
const paginate = vertz.middleware({ name: 'paginate', query: paginationQuery, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.query).toBeDefined();
    expect(result.middleware.at(0)?.query?.kind).toBe('named');
    if (result.middleware.at(0)?.query?.kind === 'named') {
      expect(result.middleware.at(0)?.query?.schemaName).toBe('paginationQuery');
    }
  });

  it('extracts body schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/validate.ts',
      `import { vertz } from '@vertz/core';
const requestBody = {};
const validate = vertz.middleware({ name: 'validate', body: requestBody, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.body).toBeDefined();
    expect(result.middleware.at(0)?.body?.kind).toBe('named');
    if (result.middleware.at(0)?.body?.kind === 'named') {
      expect(result.middleware.at(0)?.body?.schemaName).toBe('requestBody');
    }
  });

  it('extracts requires schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const requestIdState = {};
const auth = vertz.middleware({ name: 'auth', requires: requestIdState, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.requires).toBeDefined();
    expect(result.middleware.at(0)?.requires?.kind).toBe('named');
    if (result.middleware.at(0)?.requires?.kind === 'named') {
      expect(result.middleware.at(0)?.requires?.schemaName).toBe('requestIdState');
    }
  });

  it('extracts provides schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const authState = {};
const auth = vertz.middleware({ name: 'auth', provides: authState, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.provides).toBeDefined();
    expect(result.middleware.at(0)?.provides?.kind).toBe('named');
    if (result.middleware.at(0)?.provides?.kind === 'named') {
      expect(result.middleware.at(0)?.provides?.schemaName).toBe('authState');
    }
  });

  it('handles minimal middleware (name + handler only)', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/logger.ts',
      `import { vertz } from '@vertz/core';
const logger = vertz.middleware({ name: 'logger', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.name).toBe('logger');
    expect(result.middleware.at(0)?.inject).toEqual([]);
    expect(result.middleware.at(0)?.headers).toBeUndefined();
    expect(result.middleware.at(0)?.params).toBeUndefined();
    expect(result.middleware.at(0)?.query).toBeUndefined();
    expect(result.middleware.at(0)?.body).toBeUndefined();
    expect(result.middleware.at(0)?.requires).toBeUndefined();
    expect(result.middleware.at(0)?.provides).toBeUndefined();
  });

  it('handles middleware with all config properties', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/full.ts',
      `import { vertz } from '@vertz/core';
const headersSchema = {};
const paramsSchema = {};
const querySchema = {};
const bodySchema = {};
const requiresSchema = {};
const providesSchema = {};
const full = vertz.middleware({
  name: 'full',
  inject: { svc },
  headers: headersSchema,
  params: paramsSchema,
  query: querySchema,
  body: bodySchema,
  requires: requiresSchema,
  provides: providesSchema,
  handler: async (ctx: any) => ({}),
});`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.name).toBe('full');
    expect(result.middleware.at(0)?.inject).toHaveLength(1);
    expect(result.middleware.at(0)?.headers?.kind).toBe('named');
    expect(result.middleware.at(0)?.params?.kind).toBe('named');
    expect(result.middleware.at(0)?.query?.kind).toBe('named');
    expect(result.middleware.at(0)?.body?.kind).toBe('named');
    expect(result.middleware.at(0)?.requires?.kind).toBe('named');
    expect(result.middleware.at(0)?.provides?.kind).toBe('named');
  });

  it('handles empty inject object', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/logger.ts',
      `import { vertz } from '@vertz/core';
const logger = vertz.middleware({ name: 'logger', inject: {}, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.inject).toEqual([]);
  });

  it('finds multiple middleware in one file', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/all.ts',
      `import { vertz } from '@vertz/core';
const auth = vertz.middleware({ name: 'auth', handler: async (ctx: any) => ({}) });
const logger = vertz.middleware({ name: 'logger', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(2);
    expect(result.middleware.at(0)?.name).toBe('auth');
    expect(result.middleware.at(1)?.name).toBe('logger');
  });

  it('finds middleware across multiple files', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const auth = vertz.middleware({ name: 'auth', handler: async (ctx: any) => ({}) });`,
    );
    project.createSourceFile(
      'src/middleware/logger.ts',
      `import { vertz } from '@vertz/core';
const logger = vertz.middleware({ name: 'logger', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(2);
    const names = result.middleware.map((m) => m.name).sort();
    expect(names).toEqual(['auth', 'logger']);
  });

  it('resolves imported schema to its source file', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/auth-headers.schema.ts',
      `export const authHeaders = {};`,
    );
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
import { authHeaders } from '../schemas/auth-headers.schema';
const auth = vertz.middleware({ name: 'auth', headers: authHeaders, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.headers?.kind).toBe('named');
    if (result.middleware.at(0)?.headers?.kind === 'named') {
      expect(result.middleware.at(0)?.headers?.sourceFile).toContain('auth-headers.schema.ts');
    }
  });

  it('marks inline schema expressions as inline', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
import { s } from '@vertz/schema';
const auth = vertz.middleware({ name: 'auth', headers: s.object({ authorization: s.string() }), handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.headers).toBeDefined();
    expect(result.middleware.at(0)?.headers?.kind).toBe('inline');
    expect(result.middleware.at(0)?.headers?.sourceFile).toContain('auth.ts');
  });

  it('resolves re-exported schemas', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/schemas/auth-headers.schema.ts',
      `export const authHeaders = {};`,
    );
    project.createSourceFile(
      'src/schemas/index.ts',
      `export { authHeaders } from './auth-headers.schema';`,
    );
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
import { authHeaders } from '../schemas/index';
const auth = vertz.middleware({ name: 'auth', headers: authHeaders, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.headers?.kind).toBe('named');
    if (result.middleware.at(0)?.headers?.kind === 'named') {
      expect(result.middleware.at(0)?.headers?.sourceFile).toContain('auth-headers.schema.ts');
    }
  });

  it('resolves inject shorthand property names', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const tokenService = {};
const auth = vertz.middleware({ name: 'auth', inject: { tokenService }, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.inject[0]).toEqual({
      localName: 'tokenService',
      resolvedToken: 'tokenService',
    });
  });

  it('handles inject with explicit property values', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const tokenService = {};
const auth = vertz.middleware({ name: 'auth', inject: { ts: tokenService }, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware.at(0)?.inject[0]).toEqual({
      localName: 'ts',
      resolvedToken: 'tokenService',
    });
  });

  it('emits error diagnostic when name property is missing', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/broken.ts',
      `import { vertz } from '@vertz/core';
const broken = vertz.middleware({ handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(0);
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.severity).toBe('error');
    expect(diags.at(0)?.code).toBe('VERTZ_MW_MISSING_NAME');
  });

  it('emits error diagnostic when handler is missing', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/broken.ts',
      `import { vertz } from '@vertz/core';
const broken = vertz.middleware({ name: 'broken' });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(0);
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.severity).toBe('error');
    expect(diags.at(0)?.code).toBe('VERTZ_MW_MISSING_HANDLER');
  });

  it('emits warning when name is not a string literal', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/broken.ts',
      `import { vertz } from '@vertz/core';
const n = 'auth';
const broken = vertz.middleware({ name: n, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.severity).toBe('warning');
    expect(diags.at(0)?.code).toBe('VERTZ_MW_DYNAMIC_NAME');
  });

  it('emits warning when config argument is not an object literal', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/broken.ts',
      `import { vertz } from '@vertz/core';
const config = { name: 'auth', handler: async (ctx: any) => ({}) };
const broken = vertz.middleware(config);`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.severity).toBe('warning');
    expect(diags.at(0)?.code).toBe('VERTZ_MW_NON_OBJECT_CONFIG');
  });

  it('ignores non-vertz.middleware calls', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/other.ts',
      `const someOther = { middleware: (cfg: any) => cfg };
const result = someOther.middleware({ name: 'fake' });
import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/' });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(0);
  });

  it('ignores vertz.middleware calls with no arguments', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/empty.ts',
      `import { vertz } from '@vertz/core';
const broken = vertz.middleware();`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(0);
    expect(analyzer.getDiagnostics()).toHaveLength(1);
  });

  it('handles middleware assigned to exported variable', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
export const auth = vertz.middleware({ name: 'auth', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.middleware).toHaveLength(1);
    expect(result.middleware.at(0)?.name).toBe('auth');
  });

  it('emits no diagnostics for valid middleware', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `import { vertz } from '@vertz/core';
const auth = vertz.middleware({ name: 'auth', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new MiddlewareAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    expect(analyzer.getDiagnostics()).toHaveLength(0);
  });
});

describe('type-level tests', () => {
  it('MiddlewareIR.inject is InjectRef[], not any[]', () => {
    // @ts-expect-error — inject element must be InjectRef, not arbitrary shape
    const bad: MiddlewareIR['inject'][0] = { localName: 123, resolvedToken: true };
    expect(bad).toBeDefined();
  });

  it('MiddlewareIR.headers is SchemaRef | undefined, not any', () => {
    // @ts-expect-error — headers must be SchemaRef | undefined, not string
    const bad: MiddlewareIR['headers'] = 'a string';
    expect(bad).toBeDefined();
  });

  it('MiddlewareAnalyzerResult.middleware is MiddlewareIR[], not any[]', () => {
    // @ts-expect-error — middleware must be MiddlewareIR[], not arbitrary objects
    const bad: MiddlewareAnalyzerResult['middleware'] = [{ randomField: true }];
    expect(bad).toBeDefined();
  });

  it('Diagnostic.severity is a union, not string', () => {
    // @ts-expect-error — severity must be 'error' | 'warning' | 'info', not 'critical'
    const bad: Diagnostic['severity'] = 'critical';
    expect(bad).toBeDefined();
  });
});
