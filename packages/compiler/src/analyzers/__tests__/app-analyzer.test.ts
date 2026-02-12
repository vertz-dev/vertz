import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { AppAnalyzer } from '../app-analyzer';

const _sharedProject = new Project({ useInMemoryFileSystem: true });

function createProject() {
  for (const file of _sharedProject.getSourceFiles()) {
    file.deleteImmediatelySync();
  }
  return _sharedProject;
}

describe('AppAnalyzer', () => {
  it('extracts basePath from vertz.app() config', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.basePath).toBe('/api');
  });

  it('extracts version from vertz.app() config', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api', version: 'v1' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.version).toBe('v1');
  });

  it('defaults basePath to / when not specified', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({});`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.basePath).toBe('/');
  });

  it('defaults version to undefined when not specified', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.version).toBeUndefined();
  });

  it('extracts source location', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';

const app = vertz.app({ basePath: '/api' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.sourceFile).toContain('app.ts');
    expect(result.app.sourceLine).toBe(3);
    expect(result.app.sourceColumn).toBeGreaterThan(0);
  });

  it('extracts global middleware from .middlewares() call', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/request-id.ts',
      `import { vertz } from '@vertz/core';
export const requestIdMiddleware = vertz.middleware({ name: 'requestId', handler: () => {} });`,
    );
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
import { requestIdMiddleware } from './middleware/request-id';
const app = vertz.app({ basePath: '/api' })
  .middlewares([requestIdMiddleware]);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.globalMiddleware).toHaveLength(1);
    expect(result.app.globalMiddleware.at(0)?.name).toBe('requestIdMiddleware');
  });

  it('handles empty middleware array', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .middlewares([]);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.globalMiddleware).toEqual([]);
  });

  it('handles no .middlewares() call', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.globalMiddleware).toEqual([]);
  });

  it('extracts module registrations from .register() calls', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register(coreModule)
  .register(userModule);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.moduleRegistrations).toHaveLength(2);
    expect(result.app.moduleRegistrations.at(0)?.moduleName).toBe('coreModule');
    expect(result.app.moduleRegistrations.at(1)?.moduleName).toBe('userModule');
  });

  it('handles .register() with no options', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register(coreModule);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.moduleRegistrations.at(0)?.options).toBeUndefined();
  });

  it('handles .register() with object literal options', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register(userModule, { requireEmailVerification: true });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.moduleRegistrations.at(0)?.options).toEqual({
      requireEmailVerification: true,
    });
  });

  it('handles .register() with nested options', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register(userModule, { db: { host: 'localhost', port: 5432 } });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.moduleRegistrations.at(0)?.options).toEqual({
      db: { host: 'localhost', port: 5432 },
    });
  });

  it('handles .middlewares() before .register()', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .middlewares([mw])
  .register(mod);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.globalMiddleware).toHaveLength(1);
    expect(result.app.moduleRegistrations).toHaveLength(1);
  });

  it('handles .register() before .middlewares()', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register(mod)
  .middlewares([mw]);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.globalMiddleware).toHaveLength(1);
    expect(result.app.moduleRegistrations).toHaveLength(1);
  });

  it('handles multiple .register() calls', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register(mod1)
  .register(mod2)
  .register(mod3);`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.moduleRegistrations).toHaveLength(3);
    expect(result.app.moduleRegistrations.at(0)?.moduleName).toBe('mod1');
    expect(result.app.moduleRegistrations.at(1)?.moduleName).toBe('mod2');
    expect(result.app.moduleRegistrations.at(2)?.moduleName).toBe('mod3');
  });

  it('emits error when no vertz.app() call is found', async () => {
    const project = createProject();
    project.createSourceFile('src/app.ts', `const x = 1;`);
    const analyzer = new AppAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.code).toBe('VERTZ_APP_NOT_FOUND');
    expect(diags.at(0)?.severity).toBe('error');
  });

  it('emits error when multiple vertz.app() calls are found', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' });`,
    );
    project.createSourceFile(
      'src/app2.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/v2' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.code).toBe('VERTZ_APP_DUPLICATE');
    expect(diags.at(0)?.severity).toBe('error');
  });

  it('emits warning when basePath does not start with /', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: 'api' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.code).toBe('VERTZ_APP_BASEPATH_FORMAT');
    expect(diags.at(0)?.severity).toBe('warning');
  });

  it('emits warning when .register() argument is not an identifier', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api' })
  .register({ definition: { name: 'inline' } });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags.at(0)?.code).toBe('VERTZ_APP_INLINE_MODULE');
    expect(diags.at(0)?.severity).toBe('warning');
  });

  it('handles app assigned to exported variable', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
export const app = vertz.app({ basePath: '/api' });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.basePath).toBe('/api');
  });

  it('ignores non-vertz.app() calls', async () => {
    const project = createProject();
    project.createSourceFile('src/app.ts', `const app = someOther.app({ basePath: '/api' });`);
    const analyzer = new AppAnalyzer(project, resolveConfig());
    await analyzer.analyze();
    const diags = analyzer.getDiagnostics();
    expect(diags.at(0)?.code).toBe('VERTZ_APP_NOT_FOUND');
  });

  it('handles app with cors config without error', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import { vertz } from '@vertz/core';
const app = vertz.app({ basePath: '/api', cors: { origins: '*' } });`,
    );
    const analyzer = new AppAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result.app.basePath).toBe('/api');
    expect(analyzer.getDiagnostics()).toHaveLength(0);
  });
});
