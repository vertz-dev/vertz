import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, ModuleIR, RouteIR, RouterIR, SchemaIR, ServiceIR } from '../../ir/types';
import { buildManifest, ManifestGenerator } from '../manifest-generator';

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

function makeService(overrides: Partial<ServiceIR> & { name: string }): ServiceIR {
  return {
    moduleName: 'testModule',
    sourceFile: 'src/service.ts',
    sourceLine: 1,
    sourceColumn: 1,
    inject: [],
    methods: [],
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

function makeSchema(overrides: Partial<SchemaIR> & { name: string }): SchemaIR {
  return {
    sourceFile: 'src/schemas/test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    namingConvention: {},
    isNamed: true,
    ...overrides,
  };
}

describe('buildManifest', () => {
  it('returns manifest with version field', () => {
    const ir = createMinimalIR();
    const manifest = buildManifest(ir);

    expect(manifest.version).toBe('1.0.0');
  });

  it('includes app basePath and version', () => {
    const ir = createMinimalIR({
      app: {
        basePath: '/api/v1',
        version: 'v1',
        globalMiddleware: [],
        moduleRegistrations: [],
        sourceFile: 'src/app.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    });
    const manifest = buildManifest(ir);

    expect(manifest.app.basePath).toBe('/api/v1');
    expect(manifest.app.version).toBe('v1');
  });

  it('maps modules with services and routers', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          services: [makeService({ name: 'userService' })],
          routers: [makeRouter({ name: 'userRouter', routes: [] })],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.modules).toHaveLength(1);
    expect(manifest.modules[0].name).toBe('user');
    expect(manifest.modules[0].services).toEqual(['userService']);
    expect(manifest.modules[0].routers).toEqual(['userRouter']);
  });

  it('groups module imports by source module', () => {
    const ir = createMinimalIR({
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
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.modules[0].imports).toEqual([
      { from: 'core', items: ['dbService', 'cacheService'] },
    ]);
  });

  it('maps routes with all fields', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          routers: [
            makeRouter({
              name: 'userRouter',
              routes: [
                makeRoute({
                  method: 'GET',
                  fullPath: '/api/users/:id',
                  operationId: 'user_getUserById',
                  middleware: [{ name: 'auth', sourceFile: 'src/auth.ts' }],
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.routes).toHaveLength(1);
    expect(manifest.routes[0].method).toBe('GET');
    expect(manifest.routes[0].path).toBe('/api/users/:id');
    expect(manifest.routes[0].operationId).toBe('user_getUserById');
    expect(manifest.routes[0].module).toBe('user');
    expect(manifest.routes[0].router).toBe('userRouter');
    expect(manifest.routes[0].middleware).toEqual(['auth']);
  });

  it('uses $ref for named schema refs in routes', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          routers: [
            makeRouter({
              name: 'userRouter',
              routes: [
                makeRoute({
                  method: 'GET',
                  fullPath: '/api/users/:id',
                  response: {
                    kind: 'named',
                    schemaName: 'readUserResponse',
                    sourceFile: 'src/schemas/user.ts',
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.routes[0].response).toEqual({ $ref: '#/schemas/readUserResponse' });
  });

  it('inlines JSON schema for inline schema refs', () => {
    const inlineSchema = { type: 'object', properties: { id: { type: 'string' } } };
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          routers: [
            makeRouter({
              name: 'userRouter',
              routes: [
                makeRoute({
                  method: 'GET',
                  fullPath: '/api/users/:id',
                  params: {
                    kind: 'inline',
                    sourceFile: 'src/routes.ts',
                    jsonSchema: inlineSchema,
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.routes[0].params).toEqual(inlineSchema);
  });

  it('includes middleware with provides/requires', () => {
    const providesSchema = { type: 'object', properties: { user: { type: 'object' } } };
    const requiresSchema = { type: 'object', properties: { requestId: { type: 'string' } } };
    const ir = createMinimalIR({
      middleware: [
        {
          name: 'authMiddleware',
          sourceFile: 'src/middleware/auth.ts',
          sourceLine: 1,
          sourceColumn: 1,
          inject: [],
          provides: {
            kind: 'inline',
            sourceFile: 'src/middleware/auth.ts',
            jsonSchema: providesSchema,
          },
          requires: {
            kind: 'inline',
            sourceFile: 'src/middleware/auth.ts',
            jsonSchema: requiresSchema,
          },
        },
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.middleware).toHaveLength(1);
    expect(manifest.middleware[0].name).toBe('authMiddleware');
    expect(manifest.middleware[0].provides).toEqual(providesSchema);
    expect(manifest.middleware[0].requires).toEqual(requiresSchema);
  });

  it('includes dependency graph initialization order', () => {
    const ir = createMinimalIR({
      dependencyGraph: {
        nodes: [],
        edges: [],
        initializationOrder: ['core', 'user'],
        circularDependencies: [],
      },
    });
    const manifest = buildManifest(ir);

    expect(manifest.dependencyGraph.initializationOrder).toEqual(['core', 'user']);
  });

  it('includes dependency graph edges', () => {
    const ir = createMinimalIR({
      dependencyGraph: {
        nodes: [],
        edges: [{ from: 'user', to: 'core', kind: 'imports' }],
        initializationOrder: ['core', 'user'],
        circularDependencies: [],
      },
    });
    const manifest = buildManifest(ir);

    expect(manifest.dependencyGraph.edges).toEqual([{ from: 'user', to: 'core', type: 'imports' }]);
  });

  it('counts error diagnostics', () => {
    const ir = createMinimalIR({
      diagnostics: [
        {
          severity: 'error',
          code: 'VERTZ_APP_MISSING',
          message: 'App definition not found',
        },
        {
          severity: 'warning',
          code: 'VERTZ_DEAD_CODE',
          message: 'Unused service',
        },
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.diagnostics.errors).toBe(1);
    expect(manifest.diagnostics.warnings).toBe(1);
  });

  it('includes diagnostic items with suggestions', () => {
    const ir = createMinimalIR({
      diagnostics: [
        {
          severity: 'warning',
          code: 'VERTZ_DEAD_CODE',
          message: 'Unused service legacyAuthService',
          file: 'src/modules/auth/auth.module.ts',
          line: 15,
          suggestion: 'Remove the service or export it from the module',
        },
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.diagnostics.items).toEqual([
      {
        severity: 'warning',
        code: 'VERTZ_DEAD_CODE',
        message: 'Unused service legacyAuthService',
        file: 'src/modules/auth/auth.module.ts',
        line: 15,
        suggestion: 'Remove the service or export it from the module',
      },
    ]);
  });

  it('collects all named schemas into schemas map', () => {
    const ir = createMinimalIR({
      schemas: [
        makeSchema({
          name: 'readUserResponse',
          jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
        }),
        makeSchema({
          name: 'inlineSchema',
          isNamed: false,
          jsonSchema: { type: 'string' },
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.schemas.readUserResponse).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
    });
    expect(manifest.schemas.inlineSchema).toBeUndefined();
  });

  it('handles empty app (no modules)', () => {
    const ir = createMinimalIR();
    const manifest = buildManifest(ir);

    expect(manifest.modules).toEqual([]);
    expect(manifest.routes).toEqual([]);
    expect(manifest.middleware).toEqual([]);
    expect(manifest.schemas).toEqual({});
  });

  it('handles route with no schemas', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'health',
          routers: [
            makeRouter({
              name: 'healthRouter',
              routes: [makeRoute({ method: 'GET', fullPath: '/api/health' })],
            }),
          ],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.routes[0].params).toBeUndefined();
    expect(manifest.routes[0].query).toBeUndefined();
    expect(manifest.routes[0].body).toBeUndefined();
    expect(manifest.routes[0].headers).toBeUndefined();
    expect(manifest.routes[0].response).toBeUndefined();
  });

  it('handles middleware with no provides/requires', () => {
    const ir = createMinimalIR({
      middleware: [
        {
          name: 'logger',
          sourceFile: 'src/middleware/logger.ts',
          sourceLine: 1,
          sourceColumn: 1,
          inject: [],
        },
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.middleware[0].provides).toBeUndefined();
    expect(manifest.middleware[0].requires).toBeUndefined();
  });

  it('maps module exports', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          exports: ['userService', 'userRepository'],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.modules[0].exports).toEqual(['userService', 'userRepository']);
  });

  it('handles module with no services', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'config',
          services: [],
          routers: [],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.modules[0].services).toEqual([]);
    expect(manifest.modules[0].routers).toEqual([]);
  });

  it('handles route with all schema types', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'user',
          routers: [
            makeRouter({
              name: 'userRouter',
              routes: [
                makeRoute({
                  method: 'POST',
                  fullPath: '/api/users',
                  params: {
                    kind: 'named',
                    schemaName: 'createUserParams',
                    sourceFile: 'src/schemas/user.ts',
                  },
                  query: {
                    kind: 'named',
                    schemaName: 'createUserQuery',
                    sourceFile: 'src/schemas/user.ts',
                  },
                  body: {
                    kind: 'named',
                    schemaName: 'createUserBody',
                    sourceFile: 'src/schemas/user.ts',
                  },
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
              ],
            }),
          ],
        }),
      ],
    });
    const manifest = buildManifest(ir);

    expect(manifest.routes[0].params).toEqual({ $ref: '#/schemas/createUserParams' });
    expect(manifest.routes[0].query).toEqual({ $ref: '#/schemas/createUserQuery' });
    expect(manifest.routes[0].body).toEqual({ $ref: '#/schemas/createUserBody' });
    expect(manifest.routes[0].headers).toEqual({ $ref: '#/schemas/createUserHeaders' });
    expect(manifest.routes[0].response).toEqual({ $ref: '#/schemas/createUserResponse' });
  });
});

describe('ManifestGenerator.generate', () => {
  it('writes manifest.json to output directory', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-manifest-'));
    const generator = new ManifestGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);

    expect(existsSync(join(outputDir, 'manifest.json'))).toBe(true);
  });

  it('output is valid JSON', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-manifest-'));
    const generator = new ManifestGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'manifest.json'), 'utf-8');

    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('output matches AppManifest structure', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-manifest-'));
    const generator = new ManifestGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);
    const content = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf-8'));

    expect(content.version).toBe('1.0.0');
    expect(content.app).toBeDefined();
    expect(content.modules).toBeInstanceOf(Array);
    expect(content.routes).toBeInstanceOf(Array);
    expect(content.schemas).toBeDefined();
    expect(content.middleware).toBeInstanceOf(Array);
    expect(content.dependencyGraph).toBeDefined();
    expect(content.diagnostics).toBeDefined();
  });

  it('handles multi-module app', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-manifest-'));
    const generator = new ManifestGenerator(resolveConfig());
    const ir = createMinimalIR({
      modules: [
        makeModule({
          name: 'core',
          services: [makeService({ name: 'dbService' })],
        }),
        makeModule({
          name: 'user',
          routers: [
            makeRouter({
              name: 'userRouter',
              routes: [makeRoute({ method: 'GET', fullPath: '/api/users' })],
            }),
          ],
        }),
      ],
    });

    await generator.generate(ir, outputDir);
    const content = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf-8'));

    expect(content.modules).toHaveLength(2);
    expect(content.routes).toHaveLength(1);
  });

  it('handles app with diagnostics', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-manifest-'));
    const generator = new ManifestGenerator(resolveConfig());
    const ir = createMinimalIR({
      diagnostics: [
        {
          severity: 'error',
          code: 'VERTZ_APP_MISSING',
          message: 'App definition not found',
        },
      ],
    });

    await generator.generate(ir, outputDir);
    const content = JSON.parse(readFileSync(join(outputDir, 'manifest.json'), 'utf-8'));

    expect(content.diagnostics.errors).toBe(1);
    expect(content.diagnostics.items).toHaveLength(1);
  });
});
