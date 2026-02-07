import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { resolveConfig } from '../../config';
import type { ModuleDefContext, RouteIR, RouterIR } from '../../ir/types';
import type { RouteAnalyzerResult } from '../route-analyzer';
import { RouteAnalyzer } from '../route-analyzer';

function createProject() {
  return new Project({ useInMemoryFileSystem: true });
}

function createContext(vars: Record<string, string>) {
  return { moduleDefVariables: new Map(Object.entries(vars)) };
}

describe('RouteAnalyzer', () => {
  it('extracts router name from variable name', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers).toHaveLength(1);
    expect(result.routers[0]!.name).toBe('userRouter');
  });

  it('extracts router module name from context', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.moduleName).toBe('user');
  });

  it('extracts router prefix', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.prefix).toBe('/users');
  });

  it('extracts router inject references', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users', inject: { userService, authService } });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.inject).toHaveLength(2);
    expect(result.routers[0]!.inject[0]).toEqual({ localName: 'userService', resolvedToken: 'userService' });
    expect(result.routers[0]!.inject[1]).toEqual({ localName: 'authService', resolvedToken: 'authService' });
  });

  it('handles router with no inject', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.inject).toEqual([]);
  });

  it('extracts router source location', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
// comment
// another comment
const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.sourceLine).toBe(5);
    expect(result.routers[0]!.sourceFile).toContain('user.router.ts');
  });

  it('extracts GET route', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(1);
    expect(result.routers[0]!.routes[0]!.method).toBe('GET');
    expect(result.routers[0]!.routes[0]!.path).toBe('/:id');
  });

  it('extracts POST route', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.post('/', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.method).toBe('POST');
  });

  it('extracts PUT route', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.put('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.method).toBe('PUT');
  });

  it('extracts PATCH route', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.patch('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.method).toBe('PATCH');
  });

  it('extracts DELETE route', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.delete('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.method).toBe('DELETE');
  });

  it('extracts HEAD route', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.head('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.method).toBe('HEAD');
  });

  it('extracts params schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const readUserParams = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { params: readUserParams, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.params!.kind).toBe('named');
    if (route.params!.kind === 'named') {
      expect(route.params!.schemaName).toBe('readUserParams');
    }
  });

  it('extracts query schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const listUsersQuery = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/', { query: listUsersQuery, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.query!.kind).toBe('named');
    if (route.query!.kind === 'named') {
      expect(route.query!.schemaName).toBe('listUsersQuery');
    }
  });

  it('extracts body schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const createUserBody = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.post('/', { body: createUserBody, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.body!.kind).toBe('named');
    if (route.body!.kind === 'named') {
      expect(route.body!.schemaName).toBe('createUserBody');
    }
  });

  it('extracts headers schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const customHeaders = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/', { headers: customHeaders, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.headers!.kind).toBe('named');
    if (route.headers!.kind === 'named') {
      expect(route.headers!.schemaName).toBe('customHeaders');
    }
  });

  it('extracts response schema reference', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const readUserResponse = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { response: readUserResponse, handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.response!.kind).toBe('named');
    if (route.response!.kind === 'named') {
      expect(route.response!.schemaName).toBe('readUserResponse');
    }
  });

  it('extracts middleware references', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/middleware/auth.ts',
      `export const authMiddleware = {};`,
    );
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
import { authMiddleware } from '../middleware/auth';
const rateLimitMiddleware = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { middlewares: [authMiddleware, rateLimitMiddleware], handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.middleware).toHaveLength(2);
    expect(route.middleware[0]!.name).toBe('authMiddleware');
    expect(route.middleware[0]!.sourceFile).toContain('auth.ts');
    expect(route.middleware[1]!.name).toBe('rateLimitMiddleware');
  });

  it('extracts description', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { description: 'Get user by ID', handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.description).toBe('Get user by ID');
  });

  it('extracts tags', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { tags: ['users', 'admin'], handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.tags).toEqual(['users', 'admin']);
  });

  it('defaults tags to empty array', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.tags).toEqual([]);
  });

  it('defaults description to undefined', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.description).toBeUndefined();
  });

  it('computes fullPath by joining prefix and path', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.fullPath).toBe('/users/:id');
  });

  it('handles root route path', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.fullPath).toBe('/users');
  });

  it('handles nested prefix', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/api/v1/users' });
userRouter.get('/:id/posts', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.fullPath).toBe('/api/v1/users/:id/posts');
  });

  it('handles prefix with trailing slash', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users/' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.fullPath).toBe('/users/:id');
  });

  it('generates operationId from handler function name', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
const getUserById = async (ctx: any) => ({});
userRouter.get('/:id', { handler: getUserById });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.operationId).toBe('user_getUserById');
  });

  it('generates operationId from arrow function fallback', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.operationId).toBe('user_get_id');
  });

  it('generates operationId from property access handler', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
const handlers = { getUserById: async (ctx: any) => ({}) };
userRouter.get('/:id', { handler: handlers.getUserById });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.operationId).toBe('user_getUserById');
  });

  it('handles operationId collision avoidance', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const ids = result.routers[0]!.routes.map((r) => r.operationId);
    expect(ids[0]).toBe('user_get_id');
    expect(ids[1]).toBe('user_get_id_2');
  });

  it('extracts route source location', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
// comment
// another
// more
// comments
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.sourceLine).toBe(8);
    expect(result.routers[0]!.routes[0]!.sourceFile).toContain('user.router.ts');
  });

  it('extracts multiple routes on one router', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });
userRouter.post('/', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(2);
  });

  it('extracts multiple routers in one file', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/routers.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const adminModuleDef = vertz.moduleDef({ name: 'admin' });
const userRouter = userModuleDef.router({ prefix: '/users' });
const adminRouter = adminModuleDef.router({ prefix: '/admin' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user', adminModuleDef: 'admin' }));
    expect(result.routers).toHaveLength(2);
  });

  it('extracts routers across multiple files', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    project.createSourceFile(
      'src/todo/todo.router.ts',
      `import { vertz } from '@vertz/core';
const todoModuleDef = vertz.moduleDef({ name: 'todo' });
const todoRouter = todoModuleDef.router({ prefix: '/todos' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user', todoModuleDef: 'todo' }));
    expect(result.routers).toHaveLength(2);
  });

  it('handles chained route calls (fluent API)', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter
  .get('/:id', { handler: async (ctx: any) => ({}) })
  .post('/', { handler: async (ctx: any) => ({}) })
  .delete('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(3);
    const methods = result.routers[0]!.routes.map((r) => r.method);
    expect(methods).toContain('GET');
    expect(methods).toContain('POST');
    expect(methods).toContain('DELETE');
  });

  it('handles routes defined on separate statements', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });
userRouter.post('/', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(2);
  });

  it('handles inline schema expressions', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
import { s } from '@vertz/schema';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { params: s.object({ id: s.uuid() }), handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.params!.kind).toBe('inline');
  });

  it('handles missing schema properties', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const route = result.routers[0]!.routes[0]!;
    expect(route.params).toBeUndefined();
    expect(route.query).toBeUndefined();
    expect(route.body).toBeUndefined();
    expect(route.headers).toBeUndefined();
    expect(route.response).toBeUndefined();
  });

  it('handles empty middlewares array', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/', { middlewares: [], handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.middleware).toEqual([]);
  });

  it('handles missing middlewares property', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes[0]!.middleware).toEqual([]);
  });

  it('emits error when router variable is not declared with a moduleDef call', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `const someOtherThing = {};
const userRouter = someOtherThing.router({ prefix: '/users' });
userRouter.get('/:id', { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules(createContext({}));
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('VERTZ_RT_UNKNOWN_MODULE_DEF');
  });

  it('emits error when route path is not a string literal', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
const dynamicPath = '/:id';
userRouter.get(dynamicPath, { handler: async (ctx: any) => ({}) });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(0);
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('VERTZ_RT_DYNAMIC_PATH');
  });

  it('emits error when handler is missing', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const readUserParams = {};
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.get('/:id', { params: readUserParams });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(0);
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('VERTZ_RT_MISSING_HANDLER');
  });

  it('emits warning when prefix is missing', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ inject: { userService } });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.prefix).toBe('/');
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('VERTZ_RT_MISSING_PREFIX');
  });

  it('emits warning when route config is not an object literal', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
const config = { handler: async (ctx: any) => ({}) };
userRouter.get('/:id', config);`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('VERTZ_RT_DYNAMIC_CONFIG');
  });

  it('ignores method calls that are not HTTP methods', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const userRouter = userModuleDef.router({ prefix: '/users' });
userRouter.use({});
userRouter.toString();`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toHaveLength(0);
  });

  it('handles exported router', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
export const userRouter = userModuleDef.router({ prefix: '/users' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers).toHaveLength(1);
    expect(result.routers[0]!.name).toBe('userRouter');
  });

  it('does not emit unknown module def error for unrelated .router() calls', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/app.ts',
      `import express from 'express';
const app = express();
const expressRouter = express.router();`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    const diags = analyzer.getDiagnostics();
    expect(diags).toHaveLength(0);
  });

  it('handles router with no routes', async () => {
    const project = createProject();
    project.createSourceFile(
      'src/user/user.router.ts',
      `import { vertz } from '@vertz/core';
const userModuleDef = vertz.moduleDef({ name: 'user' });
const emptyRouter = userModuleDef.router({ prefix: '/empty' });`,
    );
    const analyzer = new RouteAnalyzer(project, resolveConfig());
    const result = await analyzer.analyzeForModules(createContext({ userModuleDef: 'user' }));
    expect(result.routers[0]!.routes).toEqual([]);
  });
});

describe('type-level tests', () => {
  it('RouteIR.method is a string literal union, not string', () => {
    // @ts-expect-error — 'TRACE' is not a valid HTTP method
    const bad: RouteIR['method'] = 'TRACE';
    expect(bad).toBeDefined();
  });

  it('RouterIR.routes is RouteIR[], not any[]', () => {
    // @ts-expect-error — arbitrary objects are not RouteIR
    const bad: RouterIR['routes'] = [{ foo: 'bar' }];
    expect(bad).toBeDefined();
  });

  it('RouteIR.middleware is MiddlewareRef[], not any[]', () => {
    // @ts-expect-error — string elements are not MiddlewareRef
    const bad: RouteIR['middleware'] = ['stringRef'];
    expect(bad).toBeDefined();
  });

  it('RouteIR.tags is string[], not any[]', () => {
    // @ts-expect-error — number elements are not valid tags
    const bad: RouteIR['tags'] = [42];
    expect(bad).toBeDefined();
  });

  it('RouteAnalyzerResult.routers is RouterIR[], not any[]', () => {
    // @ts-expect-error — arbitrary objects are not RouterIR
    const bad: RouteAnalyzerResult['routers'] = [{ notARouter: true }];
    expect(bad).toBeDefined();
  });

  it('ModuleDefContext.moduleDefVariables is Map<string, string>, not any', () => {
    // @ts-expect-error — Map<string, number> is not Map<string, string>
    const bad: ModuleDefContext['moduleDefVariables'] = new Map<string, number>();
    expect(bad).toBeDefined();
  });
});
