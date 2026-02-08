import type { AppIR, Compiler, ModuleIR, RouteIR, RouterIR } from '@vertz/compiler';
import { describe, expect, it, vi } from 'vitest';
import { routesAction } from '../routes';

function makeRoute(overrides: Partial<RouteIR> = {}): RouteIR {
  return {
    method: 'GET',
    path: '/users',
    fullPath: '/api/users',
    operationId: 'user_listUsers',
    middleware: [],
    tags: [],
    sourceFile: 'src/user.router.ts',
    sourceLine: 10,
    sourceColumn: 1,
    ...overrides,
  } as RouteIR;
}

function makeRouter(routes: RouteIR[], moduleName = 'user'): RouterIR {
  return {
    name: 'userRouter',
    moduleName,
    prefix: '/users',
    inject: [],
    routes,
    sourceFile: 'src/user.router.ts',
    sourceLine: 1,
    sourceColumn: 1,
  } as RouterIR;
}

function createMockCompiler(routers: RouterIR[] = []): Compiler {
  const modules = routers.map((r) => ({
    name: r.moduleName,
    routers: [r],
    imports: [],
    services: [],
    exports: [],
    sourceFile: `src/${r.moduleName}.module.ts`,
    sourceLine: 1,
    sourceColumn: 1,
  })) as ModuleIR[];

  const ir = {
    app: { basePath: '/api', globalMiddleware: [], sourceFile: '', sourceLine: 0, sourceColumn: 0 },
    modules,
    middleware: [],
    schemas: [],
    dependencyGraph: { nodes: [], edges: [] },
    diagnostics: [],
  } as unknown as AppIR;

  return {
    analyze: vi.fn().mockResolvedValue(ir),
    validate: vi.fn().mockResolvedValue([]),
    generate: vi.fn().mockResolvedValue(undefined),
    compile: vi.fn(),
    getConfig: vi.fn(),
  } as unknown as Compiler;
}

describe('routesAction', () => {
  it('returns routes from the IR', async () => {
    const route = makeRoute();
    const router = makeRouter([route]);
    const compiler = createMockCompiler([router]);
    const result = await routesAction({ compiler, format: 'json' });
    expect(result.routes).toHaveLength(1);
  });

  it('calls compiler.analyze()', async () => {
    const compiler = createMockCompiler([]);
    await routesAction({ compiler, format: 'json' });
    expect(compiler.analyze).toHaveBeenCalled();
  });

  it('returns empty routes for empty IR', async () => {
    const compiler = createMockCompiler([]);
    const result = await routesAction({ compiler, format: 'json' });
    expect(result.routes).toHaveLength(0);
  });

  it('outputs valid JSON for json format', async () => {
    const route = makeRoute();
    const router = makeRouter([route]);
    const compiler = createMockCompiler([router]);
    const result = await routesAction({ compiler, format: 'json' });
    const parsed = JSON.parse(result.output);
    expect(parsed).toBeDefined();
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('json output includes route details', async () => {
    const route = makeRoute({ method: 'POST', path: '/users' });
    const router = makeRouter([route]);
    const compiler = createMockCompiler([router]);
    const result = await routesAction({ compiler, format: 'json' });
    const parsed = JSON.parse(result.output);
    expect(parsed[0].method).toBe('POST');
    expect(parsed[0].path).toBe('/users');
  });

  it('table output includes method and path', async () => {
    const route = makeRoute({ method: 'GET', path: '/api/users' });
    const router = makeRouter([route]);
    const compiler = createMockCompiler([router]);
    const result = await routesAction({ compiler, format: 'table' });
    expect(result.output).toContain('GET');
    expect(result.output).toContain('/api/users');
  });

  it('filters by module when specified', async () => {
    const route = makeRoute();
    const router = makeRouter([route], 'user');
    const compiler = createMockCompiler([router]);
    const result = await routesAction({ compiler, format: 'json', module: 'order' });
    expect(result.routes).toHaveLength(0);
  });

  it('shows all routes when no module filter', async () => {
    const route = makeRoute();
    const router = makeRouter([route], 'user');
    const compiler = createMockCompiler([router]);
    const result = await routesAction({ compiler, format: 'json' });
    expect(result.routes).toHaveLength(1);
  });
});
