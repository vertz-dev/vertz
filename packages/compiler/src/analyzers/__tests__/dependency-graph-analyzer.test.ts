import { Project } from 'ts-morph';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import type { MiddlewareIR, ModuleIR } from '../../ir/types';
import { DependencyGraphAnalyzer, type DependencyGraphInput } from '../dependency-graph-analyzer';

function createAnalyzer() {
  const project = new Project({ useInMemoryFileSystem: true });
  return new DependencyGraphAnalyzer(project, resolveConfig());
}

function makeModule(overrides: Partial<ModuleIR> & { name: string }): ModuleIR {
  return {
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 0,
    imports: [],
    services: [],
    routers: [],
    exports: [],
    ...overrides,
  };
}

function makeMiddleware(overrides: Partial<MiddlewareIR> & { name: string }): MiddlewareIR {
  return {
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 0,
    inject: [],
    ...overrides,
  };
}

describe('DependencyGraphAnalyzer', () => {
  describe('Node creation', () => {
    it('creates nodes for modules', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [makeModule({ name: 'user' }), makeModule({ name: 'core' })],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const moduleNodes = result.graph.nodes.filter((n) => n.kind === 'module');
      expect(moduleNodes).toHaveLength(2);
      expect(moduleNodes.at(0)?.name).toBe('user');
      expect(moduleNodes.at(1)?.name).toBe('core');
    });

    it('assigns unique node IDs', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            services: [
              {
                name: 'userService',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
            routers: [
              {
                name: 'userRouter',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                prefix: '/users',
                inject: [],
                routes: [],
              },
            ],
          }),
        ],
        middleware: [makeMiddleware({ name: 'auth' })],
      };
      const result = await analyzer.analyze(input);
      const ids = result.graph.nodes.map((n) => n.id);
      expect(ids).toContain('module:user');
      expect(ids).toContain('service:user.userService');
      expect(ids).toContain('router:user.userRouter');
      expect(ids).toContain('middleware:auth');
      // All unique
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('creates nodes for middleware', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [],
        middleware: [makeMiddleware({ name: 'auth' })],
      };
      const result = await analyzer.analyze(input);
      const mwNodes = result.graph.nodes.filter((n) => n.kind === 'middleware');
      expect(mwNodes).toHaveLength(1);
      expect(mwNodes.at(0)?.name).toBe('auth');
    });

    it('creates nodes for routers', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            routers: [
              {
                name: 'userRouter',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                prefix: '/users',
                inject: [],
                routes: [],
              },
            ],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const routerNodes = result.graph.nodes.filter((n) => n.kind === 'router');
      expect(routerNodes).toHaveLength(1);
      expect(routerNodes.at(0)?.name).toBe('userRouter');
      expect(routerNodes.at(0)?.moduleName).toBe('user');
    });

    it('creates nodes for services', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            services: [
              {
                name: 'userService',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const serviceNodes = result.graph.nodes.filter((n) => n.kind === 'service');
      expect(serviceNodes).toHaveLength(1);
      expect(serviceNodes.at(0)?.name).toBe('userService');
      expect(serviceNodes.at(0)?.moduleName).toBe('user');
    });
  });

  describe('Edge creation — module imports', () => {
    it('deduplicates multiple imports from same module', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
              {
                localName: 'cacheService',
                sourceModule: 'core',
                sourceExport: 'cacheService',
                isEnvImport: false,
              },
            ],
          }),
          makeModule({ name: 'core' }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const importEdges = result.graph.edges.filter((e) => e.kind === 'imports');
      expect(importEdges).toHaveLength(1);
    });

    it('ignores env imports', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [{ localName: 'DATABASE_URL', isEnvImport: true }],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.edges).toHaveLength(0);
    });

    it('creates imports edges for module imports', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
            ],
          }),
          makeModule({ name: 'core' }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const importEdges = result.graph.edges.filter((e) => e.kind === 'imports');
      expect(importEdges).toHaveLength(1);
      expect(importEdges.at(0)?.from).toBe('module:user');
      expect(importEdges.at(0)?.to).toBe('module:core');
    });
  });

  describe('Edge creation — service inject', () => {
    it('creates inject edges for service dependencies', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            services: [
              {
                name: 'userService',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [{ localName: 'dbService', resolvedToken: 'dbService' }],
                methods: [],
              },
            ],
          }),
          makeModule({
            name: 'core',
            services: [
              {
                name: 'dbService',
                moduleName: 'core',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const injectEdges = result.graph.edges.filter((e) => e.kind === 'inject');
      expect(injectEdges).toHaveLength(1);
      expect(injectEdges.at(0)?.from).toBe('service:user.userService');
      expect(injectEdges.at(0)?.to).toBe('service:core.dbService');
    });

    it('creates inject edges for router dependencies', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            services: [
              {
                name: 'userService',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
            routers: [
              {
                name: 'userRouter',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                prefix: '/users',
                inject: [{ localName: 'userService', resolvedToken: 'userService' }],
                routes: [],
              },
            ],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const injectEdges = result.graph.edges.filter((e) => e.kind === 'inject');
      expect(injectEdges).toHaveLength(1);
      expect(injectEdges.at(0)?.from).toBe('router:user.userRouter');
      expect(injectEdges.at(0)?.to).toBe('service:user.userService');
    });

    it('creates inject edges for middleware dependencies', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'core',
            services: [
              {
                name: 'tokenService',
                moduleName: 'core',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
          }),
        ],
        middleware: [
          makeMiddleware({
            name: 'auth',
            inject: [{ localName: 'tokenService', resolvedToken: 'tokenService' }],
          }),
        ],
      };
      const result = await analyzer.analyze(input);
      const injectEdges = result.graph.edges.filter((e) => e.kind === 'inject');
      expect(injectEdges).toHaveLength(1);
      expect(injectEdges.at(0)?.from).toBe('middleware:auth');
      expect(injectEdges.at(0)?.to).toBe('service:core.tokenService');
    });
  });

  describe('Edge creation — middleware usage', () => {
    it('creates uses-middleware edges for route middleware', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            routers: [
              {
                name: 'userRouter',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                prefix: '/users',
                inject: [],
                routes: [
                  {
                    method: 'GET',
                    path: '/',
                    fullPath: '/users',
                    operationId: 'listUsers',
                    middleware: [{ name: 'auth', sourceFile: 'test.ts' }],
                    tags: [],
                    sourceFile: 'test.ts',
                    sourceLine: 1,
                    sourceColumn: 0,
                  },
                ],
              },
            ],
          }),
        ],
        middleware: [makeMiddleware({ name: 'auth' })],
      };
      const result = await analyzer.analyze(input);
      const mwEdges = result.graph.edges.filter((e) => e.kind === 'uses-middleware');
      expect(mwEdges).toHaveLength(1);
      expect(mwEdges.at(0)?.from).toBe('router:user.userRouter');
      expect(mwEdges.at(0)?.to).toBe('middleware:auth');
    });
  });

  describe('Edge creation — exports', () => {
    it('creates exports edges for module exports', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'core',
            services: [
              {
                name: 'dbService',
                moduleName: 'core',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
            exports: ['dbService'],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const exportEdges = result.graph.edges.filter((e) => e.kind === 'exports');
      expect(exportEdges).toHaveLength(1);
      expect(exportEdges.at(0)?.from).toBe('module:core');
      expect(exportEdges.at(0)?.to).toBe('service:core.dbService');
    });
  });

  describe('Topological sort', () => {
    it('produces correct initialization order for linear dependency chain', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
            ],
          }),
          makeModule({ name: 'core' }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.initializationOrder).toEqual(['core', 'user']);
    });

    it('produces correct order for diamond dependency', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
              {
                localName: 'authService',
                sourceModule: 'auth',
                sourceExport: 'authService',
                isEnvImport: false,
              },
            ],
          }),
          makeModule({
            name: 'auth',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
            ],
          }),
          makeModule({ name: 'core' }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      const order = result.graph.initializationOrder;
      expect(order.indexOf('core')).toBeLessThan(order.indexOf('auth'));
      expect(order.indexOf('core')).toBeLessThan(order.indexOf('user'));
      expect(order.indexOf('auth')).toBeLessThan(order.indexOf('user'));
    });

    it('produces correct order for independent modules', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [makeModule({ name: 'user' }), makeModule({ name: 'todo' })],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.initializationOrder).toHaveLength(2);
      expect(result.graph.initializationOrder).toContain('user');
      expect(result.graph.initializationOrder).toContain('todo');
    });

    it('handles single module', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [makeModule({ name: 'core' })],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.initializationOrder).toEqual(['core']);
    });

    it('handles empty input', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = { modules: [], middleware: [] };
      const result = await analyzer.analyze(input);
      expect(result.graph.initializationOrder).toEqual([]);
      expect(result.graph.nodes).toEqual([]);
      expect(result.graph.edges).toEqual([]);
    });
  });

  describe('Circular dependency detection', () => {
    it('detects simple circular dependency (A -> B -> A)', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'a',
            imports: [{ localName: 'x', sourceModule: 'b', sourceExport: 'x', isEnvImport: false }],
          }),
          makeModule({
            name: 'b',
            imports: [{ localName: 'y', sourceModule: 'a', sourceExport: 'y', isEnvImport: false }],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.circularDependencies).toHaveLength(1);
      const cycle = result.graph.circularDependencies.at(0);
      expect(cycle).toContain('a');
      expect(cycle).toContain('b');
      // Both modules still appear in initialization order (best-effort)
      expect(result.graph.initializationOrder).toContain('a');
      expect(result.graph.initializationOrder).toContain('b');
    });

    it('detects three-node circular dependency (A -> B -> C -> A)', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'a',
            imports: [{ localName: 'x', sourceModule: 'b', sourceExport: 'x', isEnvImport: false }],
          }),
          makeModule({
            name: 'b',
            imports: [{ localName: 'y', sourceModule: 'c', sourceExport: 'y', isEnvImport: false }],
          }),
          makeModule({
            name: 'c',
            imports: [{ localName: 'z', sourceModule: 'a', sourceExport: 'z', isEnvImport: false }],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.circularDependencies).toHaveLength(1);
      const cycle = result.graph.circularDependencies.at(0);
      expect(cycle).toContain('a');
      expect(cycle).toContain('b');
      expect(cycle).toContain('c');
    });

    it('detects self-referencing module (A -> A)', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'a',
            imports: [{ localName: 'x', sourceModule: 'a', sourceExport: 'x', isEnvImport: false }],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.circularDependencies).toHaveLength(1);
      expect(result.graph.circularDependencies.at(0)).toContain('a');
    });

    it('reports no circular dependencies when graph is acyclic', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              { localName: 'x', sourceModule: 'core', sourceExport: 'x', isEnvImport: false },
            ],
          }),
          makeModule({ name: 'core' }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.circularDependencies).toEqual([]);
    });

    it('detects multiple independent cycles', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'a',
            imports: [{ localName: 'x', sourceModule: 'b', sourceExport: 'x', isEnvImport: false }],
          }),
          makeModule({
            name: 'b',
            imports: [{ localName: 'y', sourceModule: 'a', sourceExport: 'y', isEnvImport: false }],
          }),
          makeModule({
            name: 'c',
            imports: [{ localName: 'w', sourceModule: 'd', sourceExport: 'w', isEnvImport: false }],
          }),
          makeModule({
            name: 'd',
            imports: [{ localName: 'v', sourceModule: 'c', sourceExport: 'v', isEnvImport: false }],
          }),
        ],
        middleware: [],
      };
      const result = await analyzer.analyze(input);
      expect(result.graph.circularDependencies).toHaveLength(2);
    });
  });

  describe('Diagnostics', () => {
    it('emits error diagnostic for circular module dependency', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              { localName: 'x', sourceModule: 'core', sourceExport: 'x', isEnvImport: false },
            ],
          }),
          makeModule({
            name: 'core',
            imports: [
              { localName: 'y', sourceModule: 'user', sourceExport: 'y', isEnvImport: false },
            ],
          }),
        ],
        middleware: [],
      };
      await analyzer.analyze(input);
      const diags = analyzer.getDiagnostics();
      const cycleDiag = diags.find((d) => d.code === 'VERTZ_DEP_CIRCULAR');
      expect(cycleDiag).toBeDefined();
      expect(cycleDiag?.severity).toBe('error');
    });

    it('emits warning for unresolved inject reference', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            services: [
              {
                name: 'userService',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [{ localName: 'unknownService', resolvedToken: 'unknownService' }],
                methods: [],
              },
            ],
          }),
        ],
        middleware: [],
      };
      await analyzer.analyze(input);
      const diags = analyzer.getDiagnostics();
      const unresolvedDiag = diags.find((d) => d.code === 'VERTZ_DEP_UNRESOLVED_INJECT');
      expect(unresolvedDiag).toBeDefined();
      expect(unresolvedDiag?.severity).toBe('warning');
    });

    it('emits info diagnostic for initialization order', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'user',
            imports: [
              { localName: 'x', sourceModule: 'core', sourceExport: 'x', isEnvImport: false },
            ],
          }),
          makeModule({ name: 'core' }),
        ],
        middleware: [],
      };
      await analyzer.analyze(input);
      const diags = analyzer.getDiagnostics();
      const infoDiag = diags.find((d) => d.severity === 'info');
      expect(infoDiag).toBeDefined();
      expect(infoDiag?.message).toContain('core');
      expect(infoDiag?.message).toContain('user');
    });
  });

  describe('Complex scenarios', () => {
    it('handles full realistic app graph', async () => {
      const analyzer = createAnalyzer();
      const input: DependencyGraphInput = {
        modules: [
          makeModule({
            name: 'core',
            services: [
              {
                name: 'dbService',
                moduleName: 'core',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [],
                methods: [],
              },
            ],
            exports: ['dbService'],
          }),
          makeModule({
            name: 'auth',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
            ],
            services: [
              {
                name: 'authService',
                moduleName: 'auth',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [{ localName: 'dbService', resolvedToken: 'dbService' }],
                methods: [],
              },
            ],
            routers: [
              {
                name: 'authRouter',
                moduleName: 'auth',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                prefix: '/auth',
                inject: [{ localName: 'authService', resolvedToken: 'authService' }],
                routes: [],
              },
            ],
          }),
          makeModule({
            name: 'user',
            imports: [
              {
                localName: 'dbService',
                sourceModule: 'core',
                sourceExport: 'dbService',
                isEnvImport: false,
              },
              {
                localName: 'authService',
                sourceModule: 'auth',
                sourceExport: 'authService',
                isEnvImport: false,
              },
            ],
            services: [
              {
                name: 'userService',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                inject: [{ localName: 'dbService', resolvedToken: 'dbService' }],
                methods: [],
              },
            ],
            routers: [
              {
                name: 'userRouter',
                moduleName: 'user',
                sourceFile: 'test.ts',
                sourceLine: 1,
                sourceColumn: 0,
                prefix: '/users',
                inject: [{ localName: 'userService', resolvedToken: 'userService' }],
                routes: [],
              },
            ],
          }),
        ],
        middleware: [
          makeMiddleware({
            name: 'authMiddleware',
            inject: [{ localName: 'authService', resolvedToken: 'authService' }],
          }),
        ],
      };
      const result = await analyzer.analyze(input);

      // 3 modules + 3 services + 2 routers + 1 middleware = 9 nodes
      expect(result.graph.nodes).toHaveLength(9);

      // Check node kinds
      expect(result.graph.nodes.filter((n) => n.kind === 'module')).toHaveLength(3);
      expect(result.graph.nodes.filter((n) => n.kind === 'service')).toHaveLength(3);
      expect(result.graph.nodes.filter((n) => n.kind === 'router')).toHaveLength(2);
      expect(result.graph.nodes.filter((n) => n.kind === 'middleware')).toHaveLength(1);

      // Check initialization order
      const order = result.graph.initializationOrder;
      expect(order.indexOf('core')).toBeLessThan(order.indexOf('auth'));
      expect(order.indexOf('core')).toBeLessThan(order.indexOf('user'));
      expect(order.indexOf('auth')).toBeLessThan(order.indexOf('user'));

      // No circular dependencies
      expect(result.graph.circularDependencies).toEqual([]);

      // Check that edges exist for imports, inject, exports
      const edgeKinds = new Set(result.graph.edges.map((e) => e.kind));
      expect(edgeKinds).toContain('imports');
      expect(edgeKinds).toContain('inject');
      expect(edgeKinds).toContain('exports');
    });
  });
});

describe('type-level tests', () => {
  it('AppDefinition.globalMiddleware is MiddlewareRef[], not any[]', () => {
    // @ts-expect-error — string[] is not assignable to MiddlewareRef[]
    const bad: import('../../ir/types').AppDefinition = {
      basePath: '/',
      globalMiddleware: ['stringRef'],
      moduleRegistrations: [],
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
    };
    expect(bad).toBeDefined();
  });

  it('AppDefinition.moduleRegistrations is ModuleRegistration[], not any[]', () => {
    // @ts-expect-error — { name: string } is not ModuleRegistration (needs moduleName)
    const bad: import('../../ir/types').AppDefinition = {
      basePath: '/',
      globalMiddleware: [],
      moduleRegistrations: [{ name: 'x' }],
      sourceFile: 'test.ts',
      sourceLine: 1,
      sourceColumn: 0,
    };
    expect(bad).toBeDefined();
  });

  it('ModuleRegistration.options is Record<string, unknown> | undefined, not any', () => {
    // @ts-expect-error — number is not assignable to Record<string, unknown> | undefined
    const bad: import('../../ir/types').ModuleRegistration = {
      moduleName: 'test',
      options: 42,
    };
    expect(bad).toBeDefined();
  });

  it('DependencyNode.kind is a string literal union, not string', () => {
    // @ts-expect-error — 'controller' is not a valid DependencyNodeKind
    const bad: import('../../ir/types').DependencyNode = {
      id: 'test',
      kind: 'controller',
      name: 'test',
    };
    expect(bad).toBeDefined();
  });

  it('DependencyEdge.kind is a string literal union, not string', () => {
    // @ts-expect-error — 'depends-on' is not a valid DependencyEdgeKind
    const bad: import('../../ir/types').DependencyEdge = {
      from: 'a',
      to: 'b',
      kind: 'depends-on',
    };
    expect(bad).toBeDefined();
  });

  it('DependencyGraphIR.initializationOrder is string[], not any[]', () => {
    // @ts-expect-error — number[] is not assignable to string[]
    const bad: import('../../ir/types').DependencyGraphIR = {
      nodes: [],
      edges: [],
      initializationOrder: [42],
      circularDependencies: [],
    };
    expect(bad).toBeDefined();
  });

  it('DependencyGraphIR.circularDependencies is string[][], not any[]', () => {
    // @ts-expect-error — string[] is not assignable to string[][]
    const bad: import('../../ir/types').DependencyGraphIR = {
      nodes: [],
      edges: [],
      initializationOrder: [],
      circularDependencies: ['a', 'b'],
    };
    expect(bad).toBeDefined();
  });
});
