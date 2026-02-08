import { describe, expect, it } from 'vitest';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppIR, MiddlewareIR, ModuleIR, RouteIR, RouterIR, ServiceIR } from '../../ir/types';
import { CompletenessValidator } from '../completeness-validator';

function makeService(overrides: Partial<ServiceIR> & { name: string }): ServiceIR {
  return {
    moduleName: 'test',
    inject: [],
    methods: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeRoute(overrides: Partial<RouteIR>): RouteIR {
  return {
    method: 'GET',
    path: '/',
    fullPath: '/',
    operationId: 'test',
    middleware: [],
    tags: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeRouter(overrides: Partial<RouterIR> & { name: string }): RouterIR {
  return {
    moduleName: 'test',
    prefix: '/',
    inject: [],
    routes: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeModule(overrides: Partial<ModuleIR> & { name: string }): ModuleIR {
  return {
    imports: [],
    services: [],
    routers: [],
    exports: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeMiddleware(overrides: Partial<MiddlewareIR> & { name: string }): MiddlewareIR {
  return {
    inject: [],
    sourceFile: 'test.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeIR(overrides: Partial<AppIR>): AppIR {
  return { ...createEmptyAppIR(), ...overrides };
}

describe('CompletenessValidator', () => {
  describe('response schema exists', () => {
    it('no diagnostics when route has response schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    response: {
                      kind: 'named',
                      schemaName: 'readUserResponse',
                      sourceFile: 'test.ts',
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const responseErrors = diags.filter((d) => d.code === 'VERTZ_ROUTE_MISSING_RESPONSE');
      expect(responseErrors).toEqual([]);
    });

    it('emits error when GET route has no response schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [makeRoute({ method: 'GET', fullPath: '/users/:id', response: undefined })],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      expect(diags).toHaveLength(1);
      expect(diags.at(0)?.code).toBe('VERTZ_ROUTE_MISSING_RESPONSE');
      expect(diags.at(0)?.severity).toBe('error');
      expect(diags.at(0)?.message).toContain('GET /users/:id');
    });

    it('no diagnostics for DELETE route without response schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({ method: 'DELETE', fullPath: '/users/:id', response: undefined }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const responseErrors = diags.filter((d) => d.code === 'VERTZ_ROUTE_MISSING_RESPONSE');
      expect(responseErrors).toEqual([]);
    });
  });

  describe('dead code detection — unused services', () => {
    it('no diagnostics when all services are referenced', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            services: [makeService({ name: 'userService', moduleName: 'user' })],
            routers: [
              makeRouter({
                name: 'userRouter',
                inject: [{ localName: 'userService', resolvedToken: 'userService' }],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const unused = diags.filter(
        (d) => d.code === 'VERTZ_DEAD_CODE' && d.message.includes('Service'),
      );
      expect(unused).toEqual([]);
    });

    it('emits warning for unused service', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            services: [makeService({ name: 'legacyService', moduleName: 'user' })],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const unused = diags.filter(
        (d) => d.code === 'VERTZ_DEAD_CODE' && d.message.includes('legacyService'),
      );
      expect(unused).toHaveLength(1);
      expect(unused.at(0)?.severity).toBe('warning');
    });

    it('does not flag exported services as unused', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'core',
            services: [makeService({ name: 'dbService', moduleName: 'core' })],
            exports: ['dbService'],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const unused = diags.filter(
        (d) => d.code === 'VERTZ_DEAD_CODE' && d.message.includes('dbService'),
      );
      expect(unused).toEqual([]);
    });
  });

  describe('dead code detection — unreferenced schemas', () => {
    it('no diagnostics when all schemas are referenced', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        schemas: [
          {
            name: 'createUserBody',
            sourceFile: 'test.ts',
            sourceLine: 1,
            sourceColumn: 1,
            namingConvention: {},
            isNamed: true,
          },
        ],
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    body: { kind: 'named', schemaName: 'createUserBody', sourceFile: 'test.ts' },
                    response: { kind: 'named', schemaName: 'x', sourceFile: 'test.ts' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const unused = diags.filter(
        (d) => d.code === 'VERTZ_DEAD_CODE' && d.message.includes('Schema'),
      );
      expect(unused).toEqual([]);
    });

    it('emits warning for unreferenced schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        schemas: [
          {
            name: 'oldUserSchema',
            sourceFile: 'test.ts',
            sourceLine: 1,
            sourceColumn: 1,
            namingConvention: {},
            isNamed: true,
          },
        ],
      });
      const diags = await validator.validate(ir);
      const unused = diags.filter(
        (d) => d.code === 'VERTZ_DEAD_CODE' && d.message.includes('oldUserSchema'),
      );
      expect(unused).toHaveLength(1);
      expect(unused.at(0)?.severity).toBe('warning');
    });
  });

  describe('DI wiring resolves', () => {
    it('no diagnostics when all inject tokens resolve', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'core',
            services: [makeService({ name: 'dbService', moduleName: 'core' })],
            exports: ['dbService'],
          }),
          makeModule({
            name: 'user',
            imports: [
              { localName: 'core', sourceModule: 'core', sourceExport: 'core', isEnvImport: false },
            ],
            services: [
              makeService({
                name: 'userService',
                moduleName: 'user',
                inject: [{ localName: 'dbService', resolvedToken: 'dbService' }],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const diErrors = diags.filter((d) => d.code === 'VERTZ_SERVICE_INJECT_MISSING');
      expect(diErrors).toEqual([]);
    });

    it('emits error when inject token does not resolve', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            services: [
              makeService({
                name: 'userService',
                moduleName: 'user',
                inject: [{ localName: 'unknownService', resolvedToken: 'unknownService' }],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const diErrors = diags.filter((d) => d.code === 'VERTZ_SERVICE_INJECT_MISSING');
      expect(diErrors).toHaveLength(1);
      expect(diErrors.at(0)?.severity).toBe('error');
      expect(diErrors.at(0)?.message).toContain("'userService'");
      expect(diErrors.at(0)?.message).toContain("'unknownService'");
    });

    it('resolves inject from local module services', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            services: [
              makeService({ name: 'authHelper', moduleName: 'user' }),
              makeService({
                name: 'userService',
                moduleName: 'user',
                inject: [{ localName: 'authHelper', resolvedToken: 'authHelper' }],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const diErrors = diags.filter((d) => d.code === 'VERTZ_SERVICE_INJECT_MISSING');
      expect(diErrors).toEqual([]);
    });

    it('resolves inject from imported module exports', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'core',
            services: [makeService({ name: 'dbService', moduleName: 'core' })],
            exports: ['dbService'],
          }),
          makeModule({
            name: 'user',
            imports: [
              { localName: 'core', sourceModule: 'core', sourceExport: 'core', isEnvImport: false },
            ],
            services: [
              makeService({
                name: 'userService',
                moduleName: 'user',
                inject: [{ localName: 'dbService', resolvedToken: 'dbService' }],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const diErrors = diags.filter((d) => d.code === 'VERTZ_SERVICE_INJECT_MISSING');
      expect(diErrors).toEqual([]);
    });

    it('emits error when injecting a non-exported service from another module', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'core',
            services: [makeService({ name: 'internalHelper', moduleName: 'core' })],
            exports: [],
          }),
          makeModule({
            name: 'user',
            imports: [
              { localName: 'core', sourceModule: 'core', sourceExport: 'core', isEnvImport: false },
            ],
            services: [
              makeService({
                name: 'userService',
                moduleName: 'user',
                inject: [{ localName: 'internalHelper', resolvedToken: 'internalHelper' }],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const diErrors = diags.filter((d) => d.code === 'VERTZ_SERVICE_INJECT_MISSING');
      expect(diErrors).toHaveLength(1);
      expect(diErrors.at(0)?.message).toContain("'internalHelper'");
    });
  });

  describe('middleware chains satisfied', () => {
    it('no diagnostics when middleware requires/provides chain is valid', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        app: {
          ...createEmptyAppIR().app,
          globalMiddleware: [
            { name: 'requestId', sourceFile: 'test.ts' },
            { name: 'auth', sourceFile: 'test.ts' },
          ],
        },
        middleware: [
          makeMiddleware({
            name: 'requestId',
            provides: {
              kind: 'named',
              schemaName: 'requestIdProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { requestId: { type: 'string' } } },
            },
          }),
          makeMiddleware({
            name: 'auth',
            requires: {
              kind: 'named',
              schemaName: 'authRequires',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { requestId: { type: 'string' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const mwErrors = diags.filter((d) => d.code === 'VERTZ_MW_REQUIRES_UNSATISFIED');
      expect(mwErrors).toEqual([]);
    });

    it('emits error when middleware requires key is not provided', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        app: {
          ...createEmptyAppIR().app,
          globalMiddleware: [{ name: 'auth', sourceFile: 'test.ts' }],
        },
        middleware: [
          makeMiddleware({
            name: 'auth',
            requires: {
              kind: 'named',
              schemaName: 'authRequires',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { requestId: { type: 'string' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const mwErrors = diags.filter((d) => d.code === 'VERTZ_MW_REQUIRES_UNSATISFIED');
      expect(mwErrors).toHaveLength(1);
      expect(mwErrors.at(0)?.message).toContain("'auth'");
      expect(mwErrors.at(0)?.message).toContain("'requestId'");
    });

    it('emits error when requires key is provided AFTER it in the chain', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        app: {
          ...createEmptyAppIR().app,
          globalMiddleware: [
            { name: 'auth', sourceFile: 'test.ts' },
            { name: 'requestId', sourceFile: 'test.ts' },
          ],
        },
        middleware: [
          makeMiddleware({
            name: 'auth',
            requires: {
              kind: 'named',
              schemaName: 'authRequires',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { requestId: { type: 'string' } } },
            },
          }),
          makeMiddleware({
            name: 'requestId',
            provides: {
              kind: 'named',
              schemaName: 'requestIdProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { requestId: { type: 'string' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const mwErrors = diags.filter((d) => d.code === 'VERTZ_MW_REQUIRES_UNSATISFIED');
      expect(mwErrors).toHaveLength(1);
    });
  });

  describe('no ctx key collisions', () => {
    it('no diagnostics when all ctx keys are unique', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        middleware: [
          makeMiddleware({
            name: 'auth',
            provides: {
              kind: 'named',
              schemaName: 'authProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { user: { type: 'object' } } },
            },
          }),
          makeMiddleware({
            name: 'requestId',
            provides: {
              kind: 'named',
              schemaName: 'ridProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { requestId: { type: 'string' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const collisions = diags.filter((d) => d.code === 'VERTZ_CTX_COLLISION');
      expect(collisions).toEqual([]);
    });

    it('emits error when two middlewares provide the same key', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        middleware: [
          makeMiddleware({
            name: 'auth',
            provides: {
              kind: 'named',
              schemaName: 'authProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { user: { type: 'object' } } },
            },
          }),
          makeMiddleware({
            name: 'sessionAuth',
            provides: {
              kind: 'named',
              schemaName: 'sessionProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { user: { type: 'object' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const collisions = diags.filter((d) => d.code === 'VERTZ_CTX_COLLISION');
      expect(collisions).toHaveLength(1);
      expect(collisions.at(0)?.message).toContain("'user'");
      expect(collisions.at(0)?.message).toContain("'auth'");
      expect(collisions.at(0)?.message).toContain("'sessionAuth'");
    });

    it('emits error when middleware provides key collides with reserved ctx property', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        middleware: [
          makeMiddleware({
            name: 'bad',
            provides: {
              kind: 'named',
              schemaName: 'badProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { params: { type: 'object' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const collisions = diags.filter((d) => d.code === 'VERTZ_CTX_COLLISION');
      expect(collisions).toHaveLength(1);
      expect(collisions.at(0)?.message).toContain("'params'");
      expect(collisions.at(0)?.message).toContain('reserved');
    });

    it('emits error when middleware provides collides with injected service', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            services: [makeService({ name: 'userService', moduleName: 'user' })],
            exports: ['userService'],
            routers: [
              makeRouter({
                name: 'userRouter',
                inject: [{ localName: 'userService', resolvedToken: 'userService' }],
                routes: [
                  makeRoute({
                    middleware: [{ name: 'bad', sourceFile: 'test.ts' }],
                    response: { kind: 'named', schemaName: 'x', sourceFile: 'test.ts' },
                  }),
                ],
              }),
            ],
          }),
        ],
        middleware: [
          makeMiddleware({
            name: 'bad',
            provides: {
              kind: 'named',
              schemaName: 'badProvides',
              sourceFile: 'test.ts',
              jsonSchema: { type: 'object', properties: { userService: { type: 'object' } } },
            },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const collisions = diags.filter((d) => d.code === 'VERTZ_CTX_COLLISION');
      expect(collisions).toHaveLength(1);
      expect(collisions.at(0)?.message).toContain("'userService'");
    });
  });

  describe('no duplicate routes', () => {
    it('no diagnostics when all routes have unique method+fullPath', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                  makeRoute({
                    method: 'POST',
                    fullPath: '/users',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const dupes = diags.filter((d) => d.code === 'VERTZ_ROUTE_DUPLICATE');
      expect(dupes).toEqual([]);
    });

    it('emits error for duplicate routes', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
          makeModule({
            name: 'admin',
            routers: [
              makeRouter({
                name: 'adminRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const dupes = diags.filter((d) => d.code === 'VERTZ_ROUTE_DUPLICATE');
      expect(dupes).toHaveLength(1);
      expect(dupes.at(0)?.message).toContain('GET /users/:id');
      expect(dupes.at(0)?.message).toContain('userRouter');
      expect(dupes.at(0)?.message).toContain('adminRouter');
    });

    it('allows same path with different methods', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                  makeRoute({ method: 'DELETE', fullPath: '/users/:id' }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const dupes = diags.filter((d) => d.code === 'VERTZ_ROUTE_DUPLICATE');
      expect(dupes).toEqual([]);
    });
  });

  describe('path params match schema params', () => {
    it('no diagnostics when path params match schema params', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    params: {
                      kind: 'named',
                      schemaName: 'readUserParams',
                      sourceFile: 't',
                      jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
                    },
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const paramErrors = diags.filter((d) => d.code === 'VERTZ_ROUTE_PARAM_MISMATCH');
      expect(paramErrors).toEqual([]);
    });

    it('emits error when path has param not in schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id/:slug',
                    params: {
                      kind: 'named',
                      schemaName: 'readUserParams',
                      sourceFile: 't',
                      jsonSchema: { type: 'object', properties: { id: { type: 'string' } } },
                    },
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const paramErrors = diags.filter((d) => d.code === 'VERTZ_ROUTE_PARAM_MISMATCH');
      expect(paramErrors).toHaveLength(1);
      expect(paramErrors.at(0)?.severity).toBe('error');
      expect(paramErrors.at(0)?.message).toContain(':slug');
    });

    it('emits warning when schema has param not in path', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users/:id',
                    params: {
                      kind: 'named',
                      schemaName: 'readUserParams',
                      sourceFile: 't',
                      jsonSchema: {
                        type: 'object',
                        properties: { id: { type: 'string' }, slug: { type: 'string' } },
                      },
                    },
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const paramWarnings = diags.filter((d) => d.code === 'VERTZ_ROUTE_PARAM_MISMATCH');
      expect(paramWarnings).toHaveLength(1);
      expect(paramWarnings.at(0)?.severity).toBe('warning');
      expect(paramWarnings.at(0)?.message).toContain('slug');
    });

    it('handles routes with no path params and no params schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    fullPath: '/users',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const paramErrors = diags.filter((d) => d.code === 'VERTZ_ROUTE_PARAM_MISMATCH');
      expect(paramErrors).toEqual([]);
    });
  });

  describe('module options valid', () => {
    it('no diagnostics when register options match module option schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        app: {
          ...createEmptyAppIR().app,
          moduleRegistrations: [{ moduleName: 'user', options: { enabled: true } }],
        },
        modules: [
          makeModule({
            name: 'user',
            options: { kind: 'named', schemaName: 'userModuleOptions', sourceFile: 't' },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const optErrors = diags.filter((d) => d.code === 'VERTZ_MODULE_OPTIONS_INVALID');
      expect(optErrors).toEqual([]);
    });

    it('emits warning when register provides options but module has no options schema', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        app: {
          ...createEmptyAppIR().app,
          moduleRegistrations: [{ moduleName: 'user', options: { unexpected: true } }],
        },
        modules: [makeModule({ name: 'user' })],
      });
      const diags = await validator.validate(ir);
      const optErrors = diags.filter((d) => d.code === 'VERTZ_MODULE_OPTIONS_INVALID');
      expect(optErrors).toHaveLength(1);
      expect(optErrors.at(0)?.severity).toBe('warning');
      expect(optErrors.at(0)?.message).toContain("'user'");
    });

    it('emits error when module requires options but register provides none', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        app: {
          ...createEmptyAppIR().app,
          moduleRegistrations: [{ moduleName: 'user' }],
        },
        modules: [
          makeModule({
            name: 'user',
            options: { kind: 'named', schemaName: 'userModuleOptions', sourceFile: 't' },
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const optErrors = diags.filter((d) => d.code === 'VERTZ_MODULE_OPTIONS_INVALID');
      expect(optErrors).toHaveLength(1);
      expect(optErrors.at(0)?.severity).toBe('error');
      expect(optErrors.at(0)?.message).toContain("'user'");
    });
  });

  describe('route path must start with /', () => {
    it('emits error when route path does not start with /', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    path: ':id',
                    fullPath: '/users/:id',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const pathErrors = diags.filter((d) => d.code === 'VERTZ_RT_INVALID_PATH');
      expect(pathErrors).toHaveLength(1);
      expect(pathErrors.at(0)?.severity).toBe('error');
      expect(pathErrors.at(0)?.message).toContain(':id');
    });

    it('no diagnostics when route path starts with /', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'GET',
                    path: '/:id',
                    fullPath: '/users/:id',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const pathErrors = diags.filter((d) => d.code === 'VERTZ_RT_INVALID_PATH');
      expect(pathErrors).toEqual([]);
    });

    it('emits error for path without leading / with suggestion', async () => {
      const validator = new CompletenessValidator();
      const ir = makeIR({
        modules: [
          makeModule({
            name: 'user',
            routers: [
              makeRouter({
                name: 'userRouter',
                routes: [
                  makeRoute({
                    method: 'POST',
                    path: 'create',
                    fullPath: '/users/create',
                    response: { kind: 'named', schemaName: 'x', sourceFile: 't' },
                  }),
                ],
              }),
            ],
          }),
        ],
      });
      const diags = await validator.validate(ir);
      const pathErrors = diags.filter((d) => d.code === 'VERTZ_RT_INVALID_PATH');
      expect(pathErrors).toHaveLength(1);
      expect(pathErrors.at(0)?.suggestion).toContain('/create');
    });
  });
});
