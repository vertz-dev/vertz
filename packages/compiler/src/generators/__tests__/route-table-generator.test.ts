import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, ModuleIR, RouteIR, RouterIR } from '../../ir/types';
import {
  buildRouteTable,
  RouteTableGenerator,
  renderRouteTableFile,
} from '../route-table-generator';

function createMinimalIR(overrides?: Partial<AppIR>): AppIR {
  return {
    ...createEmptyAppIR(),
    app: {
      basePath: '/api',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: 'src/app.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
    ...overrides,
  };
}

function makeRoute(
  overrides: Partial<RouteIR> & { method: RouteIR['method']; fullPath: string },
): RouteIR {
  return {
    sourceFile: 'src/routes.ts',
    sourceLine: 1,
    sourceColumn: 1,
    path: overrides.fullPath,
    operationId: `test_${overrides.method.toLowerCase()}`,
    middleware: [],
    tags: [],
    ...overrides,
  };
}

function makeRouter(overrides: Partial<RouterIR> & { name: string; routes: RouteIR[] }): RouterIR {
  return {
    moduleName: 'testModule',
    sourceFile: 'src/router.ts',
    sourceLine: 1,
    sourceColumn: 1,
    prefix: '',
    inject: [],
    ...overrides,
  };
}

function makeModule(overrides: Partial<ModuleIR> & { name: string }): ModuleIR {
  return {
    sourceFile: 'src/module.ts',
    sourceLine: 1,
    sourceColumn: 1,
    imports: [],
    services: [],
    routers: [],
    exports: [],
    ...overrides,
  };
}

function createIRWithRoutes(...routes: RouteIR[]): AppIR {
  return createMinimalIR({
    modules: [
      makeModule({
        name: 'user',
        routers: [makeRouter({ name: 'userRouter', routes })],
      }),
    ],
  });
}

describe('buildRouteTable', () => {
  it('returns empty table for app with no routes', () => {
    const ir = createMinimalIR();
    const table = buildRouteTable(ir);

    expect(table.routes).toEqual([]);
  });

  it('includes all routes from all modules', () => {
    const ir = createIRWithRoutes(
      makeRoute({ method: 'GET', fullPath: '/api/users/:id' }),
      makeRoute({ method: 'POST', fullPath: '/api/users' }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes).toHaveLength(2);
  });

  it('uses fullPath for path', () => {
    const ir = createIRWithRoutes(makeRoute({ method: 'GET', fullPath: '/api/v1/users/:id' }));
    const table = buildRouteTable(ir);

    expect(table.routes[0].path).toBe('/api/v1/users/:id');
  });

  it('includes operationId', () => {
    const ir = createIRWithRoutes(
      makeRoute({
        method: 'GET',
        fullPath: '/api/users/:id',
        operationId: 'user_getUserById',
      }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes[0].operationId).toBe('user_getUserById');
  });

  it('includes moduleName from parent module', () => {
    const ir = createIRWithRoutes(makeRoute({ method: 'GET', fullPath: '/api/users' }));
    const table = buildRouteTable(ir);

    expect(table.routes[0].moduleName).toBe('user');
  });

  it('includes routerName from parent router', () => {
    const ir = createIRWithRoutes(makeRoute({ method: 'GET', fullPath: '/api/users' }));
    const table = buildRouteTable(ir);

    expect(table.routes[0].routerName).toBe('userRouter');
  });

  it('includes middleware names', () => {
    const ir = createIRWithRoutes(
      makeRoute({
        method: 'GET',
        fullPath: '/api/users',
        middleware: [{ name: 'auth', sourceFile: 'src/auth.ts' }],
      }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes[0].middleware).toEqual(['auth']);
  });

  it('maps named schema refs to schema names', () => {
    const ir = createIRWithRoutes(
      makeRoute({
        method: 'GET',
        fullPath: '/api/users/:id',
        params: {
          kind: 'named',
          schemaName: 'readUserParams',
          sourceFile: 'src/schemas/user.ts',
        },
        response: {
          kind: 'named',
          schemaName: 'readUserResponse',
          sourceFile: 'src/schemas/user.ts',
        },
      }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes[0].schemas.params).toBe('readUserParams');
    expect(table.routes[0].schemas.response).toBe('readUserResponse');
  });

  it('omits inline schema refs', () => {
    const ir = createIRWithRoutes(
      makeRoute({
        method: 'GET',
        fullPath: '/api/users',
        params: {
          kind: 'inline',
          sourceFile: 'src/routes.ts',
          jsonSchema: { type: 'object' },
        },
      }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes[0].schemas.params).toBeUndefined();
  });

  it('handles route with no schemas', () => {
    const ir = createIRWithRoutes(makeRoute({ method: 'GET', fullPath: '/api/health' }));
    const table = buildRouteTable(ir);

    expect(table.routes[0].schemas.params).toBeUndefined();
    expect(table.routes[0].schemas.query).toBeUndefined();
    expect(table.routes[0].schemas.body).toBeUndefined();
    expect(table.routes[0].schemas.headers).toBeUndefined();
    expect(table.routes[0].schemas.response).toBeUndefined();
  });

  it('handles route with all schema types', () => {
    const ir = createIRWithRoutes(
      makeRoute({
        method: 'POST',
        fullPath: '/api/users',
        params: {
          kind: 'named',
          schemaName: 'createUserParams',
          sourceFile: 'src/schemas/user.ts',
        },
        query: { kind: 'named', schemaName: 'createUserQuery', sourceFile: 'src/schemas/user.ts' },
        body: { kind: 'named', schemaName: 'createUserBody', sourceFile: 'src/schemas/user.ts' },
        headers: {
          kind: 'named',
          schemaName: 'createUserHeaders',
          sourceFile: 'src/schemas/user.ts',
        },
        response: {
          kind: 'named',
          schemaName: 'createUserResponse',
          sourceFile: 'src/schemas/user.ts',
        },
      }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes[0].schemas.params).toBe('createUserParams');
    expect(table.routes[0].schemas.query).toBe('createUserQuery');
    expect(table.routes[0].schemas.body).toBe('createUserBody');
    expect(table.routes[0].schemas.headers).toBe('createUserHeaders');
    expect(table.routes[0].schemas.response).toBe('createUserResponse');
  });

  it('sorts routes by path then method', () => {
    const ir = createIRWithRoutes(
      makeRoute({ method: 'POST', fullPath: '/api/users' }),
      makeRoute({ method: 'GET', fullPath: '/api/users/:id' }),
      makeRoute({ method: 'GET', fullPath: '/api/users' }),
    );
    const table = buildRouteTable(ir);

    expect(table.routes[0].path).toBe('/api/users');
    expect(table.routes[0].method).toBe('GET');
    expect(table.routes[1].path).toBe('/api/users');
    expect(table.routes[1].method).toBe('POST');
    expect(table.routes[2].path).toBe('/api/users/:id');
  });
});

describe('renderRouteTableFile', () => {
  it('generates valid TypeScript', () => {
    const manifest = {
      routes: [
        {
          method: 'GET' as const,
          path: '/api/users',
          operationId: 'user_listUsers',
          moduleName: 'user',
          routerName: 'userRouter',
          middleware: [],
          schemas: {},
        },
      ],
    };
    const content = renderRouteTableFile(manifest);

    expect(content).toContain('export const routeTable');
    expect(content).toContain("method: 'GET'");
    expect(content).toContain("path: '/api/users'");
  });

  it('includes type import', () => {
    const content = renderRouteTableFile({ routes: [] });

    expect(content).toContain("import type { HttpMethod } from '@vertz/compiler'");
  });

  it('includes auto-generated header comment', () => {
    const content = renderRouteTableFile({ routes: [] });

    expect(content).toContain('Auto-generated by @vertz/compiler');
  });

  it('handles empty route table', () => {
    const content = renderRouteTableFile({ routes: [] });

    expect(content).toContain('export const routeTable: RouteTableEntry[] = [');
    expect(content).toContain('];');
  });

  it('formats schema entries correctly', () => {
    const manifest = {
      routes: [
        {
          method: 'GET' as const,
          path: '/api/users/:id',
          operationId: 'user_getUser',
          moduleName: 'user',
          routerName: 'userRouter',
          middleware: [],
          schemas: { params: 'readUserParams', response: 'readUserResponse' },
        },
      ],
    };
    const content = renderRouteTableFile(manifest);

    expect(content).toContain("params: 'readUserParams'");
    expect(content).toContain("response: 'readUserResponse'");
  });
});

describe('RouteTableGenerator.generate', () => {
  it('writes routes.ts to output directory', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-routes-'));
    const generator = new RouteTableGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);

    expect(existsSync(join(outputDir, 'routes.ts'))).toBe(true);
  });

  it('file contains valid TypeScript', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-routes-'));
    const generator = new RouteTableGenerator(resolveConfig());
    const ir = createIRWithRoutes(makeRoute({ method: 'GET', fullPath: '/api/users' }));

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'routes.ts'), 'utf-8');

    expect(content).toContain('export const routeTable');
    expect(content).toContain("method: 'GET'");
  });

  it('handles multi-module multi-router app', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-routes-'));
    const generator = new RouteTableGenerator(resolveConfig());
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          routers: [
            makeRouter({
              name: 'userRouter',
              routes: [makeRoute({ method: 'GET', fullPath: '/api/users' })],
            }),
          ],
        }),
        makeModule({
          name: 'post',
          routers: [
            makeRouter({
              name: 'postRouter',
              routes: [makeRoute({ method: 'GET', fullPath: '/api/posts' })],
            }),
          ],
        }),
      ],
    });

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'routes.ts'), 'utf-8');

    expect(content).toContain("path: '/api/posts'");
    expect(content).toContain("path: '/api/users'");
    expect(content).toContain("moduleName: 'user'");
    expect(content).toContain("moduleName: 'post'");
  });
});
