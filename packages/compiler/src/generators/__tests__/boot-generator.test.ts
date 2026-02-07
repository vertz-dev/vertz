import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../config';
import { createEmptyAppIR } from '../../ir/builder';
import type { AppDefinition, AppIR, DependencyGraphIR, ModuleIR } from '../../ir/types';
import {
  BootGenerator,
  buildBootManifest,
  renderBootFile,
  resolveImportPath,
} from '../boot-generator';

function makeApp(overrides?: Partial<AppDefinition>): AppDefinition {
  return {
    basePath: '/api',
    globalMiddleware: [],
    moduleRegistrations: [],
    sourceFile: 'src/app.ts',
    sourceLine: 1,
    sourceColumn: 1,
    ...overrides,
  };
}

function makeDepGraph(overrides?: Partial<DependencyGraphIR>): DependencyGraphIR {
  return {
    nodes: [],
    edges: [],
    initializationOrder: [],
    circularDependencies: [],
    ...overrides,
  };
}

function createMinimalIR(overrides?: Partial<AppIR>): AppIR {
  return {
    ...createEmptyAppIR(),
    app: makeApp(),
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

describe('buildBootManifest', () => {
  it('returns empty manifest for app with no modules', () => {
    const ir = createMinimalIR();
    const manifest = buildBootManifest(ir);

    expect(manifest.initializationOrder).toEqual([]);
    expect(manifest.modules).toEqual([]);
    expect(manifest.globalMiddleware).toEqual([]);
  });

  it('includes modules in initialization order', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({ name: 'user', sourceFile: 'src/modules/user/user.module.ts' }),
        makeModule({ name: 'core', sourceFile: 'src/modules/core/core.module.ts' }),
      ],
      app: makeApp({
        moduleRegistrations: [{ moduleName: 'core' }, { moduleName: 'user' }],
      }),
      dependencyGraph: makeDepGraph({
        initializationOrder: ['core', 'user'],
      }),
    });
    const manifest = buildBootManifest(ir);

    expect(manifest.initializationOrder).toEqual(['core', 'user']);
    expect(manifest.modules).toHaveLength(2);
    expect(manifest.modules[0].name).toBe('core');
    expect(manifest.modules[1].name).toBe('user');
  });

  it('attaches options from module registrations', () => {
    const ir = createMinimalIR({
      modules: [makeModule({ name: 'user', sourceFile: 'src/modules/user/user.module.ts' })],
      app: makeApp({
        moduleRegistrations: [{ moduleName: 'user', options: { requireEmailVerification: true } }],
      }),
      dependencyGraph: makeDepGraph({
        initializationOrder: ['user'],
      }),
    });
    const manifest = buildBootManifest(ir);

    expect(manifest.modules[0].options).toEqual({ requireEmailVerification: true });
  });

  it('includes global middleware in order', () => {
    const ir = createMinimalIR({
      app: makeApp({
        globalMiddleware: [
          { name: 'requestId', sourceFile: 'src/middleware/request-id.ts' },
          { name: 'errorHandler', sourceFile: 'src/middleware/error-handler.ts' },
        ],
      }),
      middleware: [
        {
          name: 'requestId',
          sourceFile: 'src/middleware/request-id.ts',
          sourceLine: 1,
          sourceColumn: 1,
          inject: [],
        },
        {
          name: 'errorHandler',
          sourceFile: 'src/middleware/error-handler.ts',
          sourceLine: 1,
          sourceColumn: 1,
          inject: [],
        },
      ],
    });
    const manifest = buildBootManifest(ir);

    expect(manifest.globalMiddleware).toHaveLength(2);
    expect(manifest.globalMiddleware[0].name).toBe('requestId');
    expect(manifest.globalMiddleware[1].name).toBe('errorHandler');
    expect(manifest.globalMiddleware[0].importPath).toBe('src/middleware/request-id.ts');
  });

  it('skips modules not in initialization order', () => {
    const ir = createMinimalIR({
      modules: [
        makeModule({ name: 'core', sourceFile: 'src/modules/core/core.module.ts' }),
        makeModule({ name: 'orphan', sourceFile: 'src/modules/orphan/orphan.module.ts' }),
      ],
      app: makeApp({
        moduleRegistrations: [{ moduleName: 'core' }],
      }),
      dependencyGraph: makeDepGraph({
        initializationOrder: ['core'],
      }),
    });
    const manifest = buildBootManifest(ir);

    expect(manifest.modules).toHaveLength(1);
    expect(manifest.modules[0].name).toBe('core');
  });

  it('handles module with no options', () => {
    const ir = createMinimalIR({
      modules: [makeModule({ name: 'core', sourceFile: 'src/modules/core/core.module.ts' })],
      app: makeApp({
        moduleRegistrations: [{ moduleName: 'core' }],
      }),
      dependencyGraph: makeDepGraph({
        initializationOrder: ['core'],
      }),
    });
    const manifest = buildBootManifest(ir);

    expect(manifest.modules[0].options).toBeUndefined();
  });
});

describe('resolveImportPath', () => {
  it('computes relative path for sibling directories', () => {
    expect(resolveImportPath('.vertz/generated', 'src/modules/user/user.module.ts')).toBe(
      '../../src/modules/user/user.module',
    );
  });

  it('strips .ts extension', () => {
    expect(resolveImportPath('.vertz/generated', 'src/app.ts')).toBe('../../src/app');
  });

  it('ensures ./ prefix for same directory', () => {
    expect(resolveImportPath('src', 'src/app.ts')).toBe('./app');
  });

  it('handles deep nesting', () => {
    expect(resolveImportPath('dist/generated/output', 'src/modules/user/user.module.ts')).toBe(
      '../../../src/modules/user/user.module',
    );
  });
});

describe('renderBootFile', () => {
  it('generates valid TypeScript with imports', () => {
    const manifest = {
      initializationOrder: ['core'],
      modules: [
        {
          name: 'core',
          importPath: 'src/modules/core/core.module.ts',
          variableName: 'coreModule',
        },
      ],
      globalMiddleware: [],
    };
    const content = renderBootFile(manifest, '.vertz/generated');

    expect(content).toContain("import { coreModule } from '../../src/modules/core/core.module';");
    expect(content).toContain('export const bootSequence');
  });

  it('includes auto-generated header comment', () => {
    const manifest = {
      initializationOrder: [],
      modules: [],
      globalMiddleware: [],
    };
    const content = renderBootFile(manifest, '.vertz/generated');

    expect(content).toContain('Auto-generated by @vertz/compiler');
  });

  it('includes options in module entries', () => {
    const manifest = {
      initializationOrder: ['user'],
      modules: [
        {
          name: 'user',
          importPath: 'src/modules/user/user.module.ts',
          variableName: 'userModule',
          options: { requireEmailVerification: true },
        },
      ],
      globalMiddleware: [],
    };
    const content = renderBootFile(manifest, '.vertz/generated');

    expect(content).toContain('requireEmailVerification');
  });

  it('includes global middleware imports', () => {
    const manifest = {
      initializationOrder: [],
      modules: [],
      globalMiddleware: [
        {
          name: 'requestId',
          importPath: 'src/middleware/request-id.ts',
          variableName: 'requestId',
        },
      ],
    };
    const content = renderBootFile(manifest, '.vertz/generated');

    expect(content).toContain("import { requestId } from '../../src/middleware/request-id';");
    expect(content).toContain('globalMiddleware');
  });

  it('generates as const assertion', () => {
    const manifest = {
      initializationOrder: [],
      modules: [],
      globalMiddleware: [],
    };
    const content = renderBootFile(manifest, '.vertz/generated');

    expect(content).toContain('as const');
  });
});

describe('BootGenerator.generate', () => {
  it('writes boot.ts to output directory', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-boot-'));
    const generator = new BootGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);

    expect(existsSync(join(outputDir, 'boot.ts'))).toBe(true);
  });

  it('file contains valid TypeScript', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-boot-'));
    const generator = new BootGenerator(resolveConfig());
    const ir = createMinimalIR({
      modules: [makeModule({ name: 'core', sourceFile: 'src/modules/core/core.module.ts' })],
      app: makeApp({
        moduleRegistrations: [{ moduleName: 'core' }],
      }),
      dependencyGraph: makeDepGraph({
        initializationOrder: ['core'],
      }),
    });

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'boot.ts'), 'utf-8');

    expect(content).toContain('export const bootSequence');
    expect(content).toContain('as const');
    expect(content).toContain('import { coreModule }');
  });

  it('handles multi-module app', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-boot-'));
    const generator = new BootGenerator(resolveConfig());
    const ir = createMinimalIR({
      modules: [
        makeModule({ name: 'core', sourceFile: 'src/modules/core/core.module.ts' }),
        makeModule({ name: 'user', sourceFile: 'src/modules/user/user.module.ts' }),
      ],
      app: makeApp({
        moduleRegistrations: [{ moduleName: 'core' }, { moduleName: 'user' }],
      }),
      dependencyGraph: makeDepGraph({
        initializationOrder: ['core', 'user'],
      }),
    });

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'boot.ts'), 'utf-8');

    expect(content).toContain('import { coreModule }');
    expect(content).toContain('import { userModule }');
    expect(content).toContain("initializationOrder: ['core', 'user']");
  });

  it('handles app with no global middleware', async () => {
    const outputDir = mkdtempSync(join(tmpdir(), 'vertz-boot-'));
    const generator = new BootGenerator(resolveConfig());
    const ir = createMinimalIR();

    await generator.generate(ir, outputDir);
    const content = readFileSync(join(outputDir, 'boot.ts'), 'utf-8');

    expect(content).toContain('globalMiddleware: []');
  });
});
