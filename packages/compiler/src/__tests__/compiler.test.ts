import { describe, expect, it } from 'bun:test';
import type { CompilerDependencies, Validator } from '../compiler';
import { Compiler, createCompiler } from '../compiler';
import { resolveConfig } from '../config';
import { createDiagnostic } from '../errors';
import { createEmptyDependencyGraph } from '../ir/builder';
import type {
  AppDefinition,
  DependencyGraphIR,
  EnvIR,
  MiddlewareIR,
  ModuleIR,
  SchemaIR,
} from '../ir/types';

function stubDependencies(calls: string[]): CompilerDependencies {
  const emptyApp: AppDefinition = {
    basePath: '',
    globalMiddleware: [],
    moduleRegistrations: [],
    sourceFile: '',
    sourceLine: 0,
    sourceColumn: 0,
  };
  return {
    analyzers: {
      env: {
        analyze: async () => {
          calls.push('analyze:env');
          return { env: undefined };
        },
        getDiagnostics: () => [],
      },
      schema: {
        analyze: async () => {
          calls.push('analyze:schema');
          return { schemas: [] };
        },
        getDiagnostics: () => [],
      },
      middleware: {
        analyze: async () => {
          calls.push('analyze:middleware');
          return { middleware: [] };
        },
        getDiagnostics: () => [],
      },
      module: {
        analyze: async () => {
          calls.push('analyze:module');
          return { modules: [] };
        },
        getDiagnostics: () => [],
      },
      app: {
        analyze: async () => {
          calls.push('analyze:app');
          return { app: emptyApp };
        },
        getDiagnostics: () => [],
      },
      entity: {
        analyze: async () => {
          calls.push('analyze:entity');
          return { entities: [] };
        },
        getDiagnostics: () => [],
      },
      dependencyGraph: {
        analyze: async () => {
          calls.push('analyze:dependencyGraph');
          return { graph: createEmptyDependencyGraph() };
        },
        getDiagnostics: () => [],
      },
    },
    validators: [],
    generators: [],
  };
}

function typedDependencies(): CompilerDependencies {
  const app: AppDefinition = {
    basePath: '/api',
    version: '1.0.0',
    globalMiddleware: [],
    moduleRegistrations: [],
    sourceFile: 'src/app.ts',
    sourceLine: 1,
    sourceColumn: 1,
  };
  const modules: ModuleIR[] = [
    {
      name: 'user',
      imports: [],
      services: [],
      routers: [],
      exports: [],
      sourceFile: 'src/modules/user/user.module.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
  ];
  const schemas: SchemaIR[] = [
    {
      name: 'CreateUser',
      isNamed: true,
      moduleName: '',
      namingConvention: {},
      sourceFile: 'src/schemas/user.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
  ];
  const middleware: MiddlewareIR[] = [
    {
      name: 'auth',
      inject: [],
      sourceFile: 'src/middleware/auth.ts',
      sourceLine: 1,
      sourceColumn: 1,
    },
  ];
  const env: EnvIR = {
    loadFiles: ['.env'],
    variables: [],
    sourceFile: 'src/env.ts',
    sourceLine: 1,
    sourceColumn: 1,
  };
  const graph: DependencyGraphIR = {
    ...createEmptyDependencyGraph(),
    initializationOrder: ['user'],
  };

  return {
    analyzers: {
      env: { analyze: async () => ({ env }), getDiagnostics: () => [] },
      schema: { analyze: async () => ({ schemas }), getDiagnostics: () => [] },
      middleware: { analyze: async () => ({ middleware }), getDiagnostics: () => [] },
      module: { analyze: async () => ({ modules }), getDiagnostics: () => [] },
      app: { analyze: async () => ({ app }), getDiagnostics: () => [] },
      entity: { analyze: async () => ({ entities: [] }), getDiagnostics: () => [] },
      dependencyGraph: { analyze: async () => ({ graph }), getDiagnostics: () => [] },
    },
    validators: [],
    generators: [],
  };
}

describe('Compiler', () => {
  it('runs all analyzers', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    expect(calls).toContain('analyze:env');
    expect(calls).toContain('analyze:schema');
    expect(calls).toContain('analyze:middleware');
    expect(calls).toContain('analyze:module');
    expect(calls).toContain('analyze:app');
    expect(calls).toContain('analyze:dependencyGraph');
  });

  it('runs validators after analyzers', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    const validator: Validator = {
      validate: async () => {
        calls.push('validate');
        return [];
      },
    };
    deps.validators.push(validator);
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    const analyzeIndices = calls
      .filter((c) => c.startsWith('analyze:'))
      .map((c) => calls.indexOf(c));
    const validateIndex = calls.indexOf('validate');
    for (const idx of analyzeIndices) {
      expect(idx).toBeLessThan(validateIndex);
    }
  });

  it('runs generators when no errors', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.generators.push({
      generate: async () => {
        calls.push('generate');
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    expect(calls).toContain('generate');
  });

  it('skips generators when errors exist', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'err' }),
      ],
    });
    deps.generators.push({
      generate: async () => {
        calls.push('generate');
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.compile();
    expect(calls).not.toContain('generate');
  });

  it('returns success: true when no errors', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.success).toBe(true);
  });

  it('returns success: false when errors exist', async () => {
    const deps = stubDependencies([]);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'err' }),
      ],
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.success).toBe(false);
  });

  it('collects diagnostics from all validators', async () => {
    const deps = stubDependencies([]);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'w1' }),
      ],
    });
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'info', code: 'VERTZ_DEAD_CODE', message: 'i1' }),
      ],
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.diagnostics).toHaveLength(2);
  });

  it('returns the assembled IR', async () => {
    const deps = stubDependencies([]);
    const compiler = new Compiler(resolveConfig(), deps);
    const result = await compiler.compile();
    expect(result.ir).toBeDefined();
    expect(result.ir.app).toBeDefined();
    expect(result.ir.modules).toBeDefined();
    expect(result.ir.middleware).toBeDefined();
    expect(result.ir.schemas).toBeDefined();
  });

  it('analyze runs all analyzers', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    const compiler = new Compiler(resolveConfig(), deps);
    await compiler.analyze();

    expect(calls).toContain('analyze:env');
    expect(calls).toContain('analyze:schema');
    expect(calls).toContain('analyze:middleware');
    expect(calls).toContain('analyze:module');
    expect(calls).toContain('analyze:app');
    expect(calls).toContain('analyze:dependencyGraph');
  });

  it('validate returns diagnostics from all validators', async () => {
    const deps = stubDependencies([]);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'warning', code: 'VERTZ_SERVICE_UNUSED', message: 'w1' }),
      ],
    });
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'e1' }),
      ],
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const ir = await compiler.analyze();
    const diagnostics = await compiler.validate(ir);

    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[1].severity).toBe('error');
  });

  it('generate runs all generators', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.generators.push({
      generate: async () => {
        calls.push('generate:a');
      },
    });
    deps.generators.push({
      generate: async () => {
        calls.push('generate:b');
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const ir = await compiler.analyze();
    await compiler.generate(ir);

    expect(calls).toContain('generate:a');
    expect(calls).toContain('generate:b');
  });

  it('compile generates despite errors with forceGenerate', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.validators.push({
      validate: async () => [
        createDiagnostic({ severity: 'error', code: 'VERTZ_APP_MISSING', message: 'err' }),
      ],
    });
    deps.generators.push({
      generate: async () => {
        calls.push('generate');
      },
    });
    const config = resolveConfig({ forceGenerate: true });
    const compiler = new Compiler(config, deps);
    const result = await compiler.compile();

    expect(result.success).toBe(false);
    expect(calls).toContain('generate');
  });

  it('analyze returns IR without running validators', async () => {
    const calls: string[] = [];
    const deps = stubDependencies(calls);
    deps.validators.push({
      validate: async () => {
        calls.push('validate');
        return [];
      },
    });
    const compiler = new Compiler(resolveConfig(), deps);
    const ir = await compiler.analyze();

    expect(ir).toBeDefined();
    expect(ir.app).toBeDefined();
    expect(calls).not.toContain('validate');
  });

  it('analyze enriches schemas with moduleName from route references', async () => {
    const app: AppDefinition = {
      basePath: '/api',
      globalMiddleware: [],
      moduleRegistrations: [],
      sourceFile: 'src/app.ts',
      sourceLine: 1,
      sourceColumn: 1,
    };
    const modules: ModuleIR[] = [
      {
        name: 'users',
        imports: [],
        services: [],
        routers: [
          {
            name: 'usersRouter',
            moduleName: 'users',
            prefix: '/users',
            inject: [],
            routes: [
              {
                method: 'POST',
                path: '/',
                fullPath: '/users',
                operationId: 'users_create',
                body: {
                  kind: 'named',
                  schemaName: 'createUserBody',
                  sourceFile: 'src/schemas/user.ts',
                },
                middleware: [],
                tags: [],
                sourceFile: 'src/routes.ts',
                sourceLine: 1,
                sourceColumn: 1,
              },
            ],
            sourceFile: 'src/routes.ts',
            sourceLine: 1,
            sourceColumn: 1,
          },
        ],
        exports: [],
        sourceFile: 'src/modules/users/users.module.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    const schemas: SchemaIR[] = [
      {
        name: 'createUserBody',
        isNamed: false,
        moduleName: '',
        namingConvention: {},
        sourceFile: 'src/schemas/user.ts',
        sourceLine: 1,
        sourceColumn: 1,
      },
    ];
    const deps: CompilerDependencies = {
      analyzers: {
        env: { analyze: async () => ({ env: undefined }), getDiagnostics: () => [] },
        schema: { analyze: async () => ({ schemas }), getDiagnostics: () => [] },
        middleware: { analyze: async () => ({ middleware: [] }), getDiagnostics: () => [] },
        module: { analyze: async () => ({ modules }), getDiagnostics: () => [] },
        app: { analyze: async () => ({ app }), getDiagnostics: () => [] },
        entity: { analyze: async () => ({ entities: [] }), getDiagnostics: () => [] },
        dependencyGraph: {
          analyze: async () => ({ graph: createEmptyDependencyGraph() }),
          getDiagnostics: () => [],
        },
      },
      validators: [],
      generators: [],
    };
    const compiler = new Compiler(resolveConfig(), deps);
    const ir = await compiler.analyze();

    expect(ir.schemas[0].moduleName).toBe('users');
  });

  it('analyze assembles IR from analyzer results', async () => {
    const deps = typedDependencies();
    const compiler = new Compiler(resolveConfig(), deps);
    const ir = await compiler.analyze();

    expect(ir.app.basePath).toBe('/api');
    expect(ir.app.version).toBe('1.0.0');
    expect(ir.modules).toHaveLength(1);
    expect(ir.modules[0].name).toBe('user');
    expect(ir.schemas).toHaveLength(1);
    expect(ir.schemas[0].name).toBe('CreateUser');
    expect(ir.middleware).toHaveLength(1);
    expect(ir.middleware[0].name).toBe('auth');
    expect(ir.env?.loadFiles).toEqual(['.env']);
    expect(ir.dependencyGraph.initializationOrder).toEqual(['user']);
  });
});

describe('createCompiler', () => {
  it('returns a Compiler instance', () => {
    const compiler = createCompiler();
    expect(compiler).toBeInstanceOf(Compiler);
  }, 15_000);
});
