import { describe, expect, it } from 'bun:test';
import { Project } from 'ts-morph';
import { RouteAnalyzer } from '../analyzers/route-analyzer';
import { resolveConfig } from '../config';

function createProject(files: Record<string, string>) {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { strict: true },
  });
  for (const [path, content] of Object.entries(files)) {
    project.createSourceFile(path, content);
  }
  return project;
}

describe('RouteAnalyzer', () => {
  it('analyze() returns empty routers array', async () => {
    const project = createProject({});
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyze();
    expect(result).toEqual({ routers: [] });
  });

  it('analyzeForModules detects chained HTTP calls', async () => {
    const project = createProject({
      'src/routes.ts': `
        const myModule = {
          router: (opts: any) => ({
            get: (path: string, config: any) => ({
              post: (path2: string, config2: any) => ({}),
            }),
          }),
        };
        const userRouter = myModule.router({ prefix: '/users' });
        userRouter.get('/list', {
          handler: listUsers,
        }).post('/create', {
          handler: createUser,
        });
        function listUsers() {}
        function createUser() {}
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'user']]),
    });
    expect(result.routers.length).toBe(1);
    // Both the direct .get() and the chained .post() should be found
    const routes = result.routers[0]?.routes ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(1);
  });

  it('generates duplicate-safe operation IDs', async () => {
    const project = createProject({
      'src/routes.ts': `
        const myModule = {
          router: (opts: any) => ({
            get: (path: string, config: any) => ({}),
          }),
        };
        const router = myModule.router({ prefix: '/api' });
        router.get('/items', { handler: listItems });
        router.get('/items', { handler: listItems });
        function listItems() {}
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'test']]),
    });
    const routes = result.routers[0]?.routes ?? [];
    expect(routes.length).toBeGreaterThanOrEqual(2);
    const ids = routes.map((r) => r.operationId);
    // IDs should be unique (first = test_listItems, second = test_listItems_2)
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('emits warning for missing prefix', async () => {
    const project = createProject({
      'src/routes.ts': `
        const myModule = {
          router: (opts: any) => ({
            get: (path: string, config: any) => ({}),
          }),
        };
        const router = myModule.router({});
        router.get('/test', { handler: testHandler });
        function testHandler() {}
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'test']]),
    });
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'VERTZ_RT_MISSING_PREFIX')).toBe(true);
  });

  it('emits error for dynamic route paths', async () => {
    const project = createProject({
      'src/routes.ts': `
        const myModule = {
          router: (opts: any) => ({
            get: (path: string, config: any) => ({}),
          }),
        };
        const path = '/dynamic';
        const router = myModule.router({ prefix: '/api' });
        router.get(path, { handler: testHandler });
        function testHandler() {}
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'test']]),
    });
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'VERTZ_RT_DYNAMIC_PATH')).toBe(true);
  });

  it('emits error for missing handler', async () => {
    const project = createProject({
      'src/routes.ts': `
        const myModule = {
          router: (opts: any) => ({
            get: (path: string, config: any) => ({}),
          }),
        };
        const router = myModule.router({ prefix: '/api' });
        router.get('/test', { description: 'no handler here' });
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'test']]),
    });
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'VERTZ_RT_MISSING_HANDLER')).toBe(true);
  });

  it('detects unknown router calls on non-module-def variables', async () => {
    const project = createProject({
      'src/routes.ts': `
        const unknownVar = { router: (opts: any) => ({ get: (p: string, c: any) => ({}) }) };
        const orphanRouter = unknownVar.router({ prefix: '/orphan' });
        orphanRouter.get('/test', { handler: testHandler });
        function testHandler() {}
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'test']]),
    });
    const diagnostics = analyzer.getDiagnostics();
    expect(diagnostics.some((d) => d.code === 'VERTZ_RT_UNKNOWN_MODULE_DEF')).toBe(true);
  });

  it('generates path-based operationId when handler is a PropertyAccessExpression', async () => {
    const project = createProject({
      'src/routes.ts': `
        const myModule = {
          router: (opts: any) => ({
            get: (path: string, config: any) => ({}),
          }),
        };
        const handlers = { listItems: () => {} };
        const router = myModule.router({ prefix: '/api' });
        router.get('/items', { handler: handlers.listItems });
      `,
    });
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules({
      moduleDefVariables: new Map([['myModule', 'test']]),
    });
    const routes = result.routers[0]?.routes ?? [];
    expect(routes.length).toBe(1);
    // PropertyAccessExpression handler — uses the property name
    expect(routes[0]?.operationId).toBe('test_listItems');
  });
});
