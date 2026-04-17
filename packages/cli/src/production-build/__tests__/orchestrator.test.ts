/**
 * Build Orchestrator Tests
 *
 * Tests for the production build orchestrator that handles:
 * - Codegen pipeline execution
 * - Type checking
 * - Bundling (using esbuild JavaScript API)
 * - Manifest generation
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockFunction,
  vi,
  mock,
} from '@vertz/test';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BuildOrchestrator, createBuildOrchestrator } from '../orchestrator';
import type { BuildConfig, BuildManifest } from '../types';

// Mock dependencies — every mock uses a factory-supplied implementation so it
// survives `vi.restoreAllMocks()` (vitest semantics: mockRestore returns mocks
// to their initial state, which means a `mock().mockResolvedValue(x)` mock
// drops to `undefined`, but `mock(() => Promise.resolve(x))` retains its impl).
vi.mock('@vertz/compiler', () => {
  return {
    createCompiler: mock(() => ({
      analyze: mock(async () => ({
        modules: [{ name: 'test', services: [], routes: [], schemas: [] }],
        routes: [],
        schemas: [],
        env: { variables: [] },
        middlewares: [],
      })),
      validate: mock(async () => []),
      compile: mock(async () => ({ success: true, diagnostics: [] })),
      getConfig: mock(() => ({
        strict: false,
        forceGenerate: false,
        compiler: {
          sourceDir: 'src',
          outputDir: '.vertz/generated',
          schemas: {
            enforceNaming: true,
            enforcePlacement: true,
          },
          openapi: {
            output: '.vertz/generated/openapi.json',
            info: { title: 'Vertz App', version: '1.0.0' },
          },
          validation: {
            requireResponseSchema: false,
            detectDeadCode: false,
          },
        },
      })),
    })),
    Compiler: mock(),
    OpenAPIGenerator: class {
      generate = mock(async () => undefined);
    },
  };
});

vi.mock('@vertz/codegen', () => ({
  createCodegenPipeline: mock(() => ({
    validate: mock(() => []),
    generate: mock(async () => ({
      files: [{ path: 'test.ts', content: 'export type Test = string;' }],
      fileCount: 1,
      generators: ['typescript'],
      incremental: { written: ['test.ts'], skipped: [], removed: [] },
    })),
    resolveOutputDir: mock(() => '.vertz/generated'),
    resolveConfig: mock((config) => config),
  })),
  generate: mock(async () => ({
    files: [{ path: 'test.ts', content: 'export type Test = string;' }],
    fileCount: 1,
    generators: ['typescript'],
  })),
}));

// Mock esbuild — factory impl so default behavior survives restoreAllMocks.
vi.mock('esbuild', () => ({
  build: mock(async () => ({
    errors: [],
    warnings: [],
    metafile: {
      inputs: {},
      outputs: {
        '.vertz/build/index.js': {
          bytes: 1000,
          inputs: {},
        },
      },
    },
  })),
}));

describe('BuildOrchestrator', () => {
  let orchestrator: BuildOrchestrator;

  const defaultConfig: BuildConfig = {
    sourceDir: 'src',
    outputDir: '.vertz/build',
    typecheck: true,
    minify: true,
    sourcemap: false,
    target: 'node',
    entryPoint: 'src/app.ts',
  };

  beforeEach(async () => {
    // Get the mocked esbuild module and reset its implementation
    const esbuild = await import('esbuild');
    const mockBuild = esbuild.build as Mock;
    mockBuild.mockResolvedValue({
      errors: [],
      warnings: [],
      outputFiles: [],
      mangleCache: {},
      metafile: {
        inputs: {},
        outputs: {
          '.vertz/build/index.js': {
            bytes: 1000,
            inputs: {},
          },
        },
      },
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create an orchestrator with default config', () => {
      const defaultOrchestrator = new BuildOrchestrator();
      expect(defaultOrchestrator).toBeDefined();
    });

    it('should accept custom config', () => {
      const customConfig: Partial<BuildConfig> = {
        sourceDir: 'my-source',
        outputDir: 'my-output',
        target: 'edge',
      };
      const customOrchestrator = new BuildOrchestrator(customConfig);
      expect(customOrchestrator).toBeDefined();
    });

    it('should have default config values', () => {
      const defaultOrchestrator = new BuildOrchestrator();
      expect(defaultOrchestrator).toBeDefined();
    });
  });

  describe('build', () => {
    it('should run the full build pipeline with all stages', async () => {
      orchestrator = new BuildOrchestrator(defaultConfig);
      const result = await orchestrator.build();

      expect(result.success).toBe(true);
      expect(result.stages.codegen).toBe(true);
      expect(result.stages.typecheck).toBe(true);
      expect(result.stages.bundle).toBe(true);
    });

    it('should skip typecheck when disabled', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.success).toBe(true);
      expect(result.stages.typecheck).toBe(false);
    });

    it('should return failure when bundle fails', async () => {
      // Mock esbuild to fail
      const esbuild = await import('esbuild');
      const mockBuild = esbuild.build as Mock;
      mockBuild.mockRejectedValue(new Error('Build failed'));

      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false, // Skip typecheck to focus on bundle failure
      });

      const result = await orchestrator.build();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Build failed');
      expect(result.stages.bundle).toBe(false);
    });

    it('should generate a manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.manifest).toBeDefined();
      expect(result.manifest).toHaveProperty('entryPoint');
      expect(result.manifest).toHaveProperty('outputDir');
      expect(result.manifest).toHaveProperty('size');
      expect(result.manifest).toHaveProperty('buildTime');
    });

    it('should include generated files in manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.manifest).toHaveProperty('generatedFiles');
      expect(Array.isArray(result.manifest.generatedFiles)).toBe(true);
    });

    it('should include bundle size in manifest', async () => {
      // This test verifies size is extracted from the bundle
      // The actual file size might be 0 in mock environment
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      // Size should be present in the manifest (actual value depends on fs)
      expect(result.manifest.size).toBeDefined();
    });

    it('should return error when bundle fails', async () => {
      // Mock esbuild to fail
      const esbuild = await import('esbuild');
      const mockBuild = esbuild.build as Mock;
      mockBuild.mockRejectedValue(new Error('Bundle failed'));

      const failingOrchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await failingOrchestrator.build();

      // The result should have error field when bundle fails
      expect(result.success).toBe(false);
      expect(result.error).toContain('Bundle failed');
    });
  });

  describe('manifest', () => {
    it('should include entry point in manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.manifest.entryPoint).toBe(defaultConfig.entryPoint);
    });

    it('should include output directory in manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.manifest.outputDir).toBe(defaultConfig.outputDir);
    });

    it('should include build timestamp in manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const beforeBuild = Date.now();
      const result = await orchestrator.build();
      const afterBuild = Date.now();

      expect(result.manifest.buildTime).toBeGreaterThanOrEqual(beforeBuild);
      expect(result.manifest.buildTime).toBeLessThanOrEqual(afterBuild);
    });

    it('should include target in manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
        target: 'edge',
      });

      const result = await orchestrator.build();

      expect(result.manifest.target).toBe('edge');
    });
  });

  describe('createBuildOrchestrator', () => {
    it('should create a new build orchestrator', () => {
      const orch = createBuildOrchestrator(defaultConfig);
      expect(orch).toBeDefined();
    });
  });

  describe('esbuild externals', () => {
    it('should externalize vertz meta-package imports', async () => {
      const esbuild = await import('esbuild');
      const mockBuild = esbuild.build as Mock;

      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      await orchestrator.build();

      expect(mockBuild).toHaveBeenCalled();
      const buildOptions = mockBuild.mock.calls[0][0];
      expect(buildOptions.external).toContain('vertz');
    });
  });

  describe('build duration', () => {
    it('should record build duration', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.durationMs).toBeGreaterThan(0);
    });
  });

  describe('generated files collection and manifest', () => {
    const generatedDir = '.vertz/generated';

    beforeEach(async () => {
      // Create .vertz/generated directory with test files
      mkdirSync(join(generatedDir, 'sub'), { recursive: true });
      writeFileSync(join(generatedDir, 'types.d.ts'), 'export type T = string;');
      writeFileSync(join(generatedDir, 'routes.ts'), 'export const routes = {};');
      writeFileSync(join(generatedDir, 'openapi.json'), '{}');
      writeFileSync(join(generatedDir, 'client-sdk.ts'), 'export default {};');
      writeFileSync(join(generatedDir, 'sub', 'nested.ts'), 'export {};');

      // Ensure mocks are in their default state (may have been corrupted by prior tests)
      const esbuild = await import('esbuild');
      (esbuild.build as Mock).mockResolvedValue({
        errors: [],
        warnings: [],
        metafile: {
          inputs: {},
          outputs: {
            '.vertz/build/index.js': { bytes: 1000, inputs: {} },
          },
        },
      });
    });

    afterEach(() => {
      rmSync('.vertz', { recursive: true, force: true });
      rmSync(defaultConfig.outputDir, { recursive: true, force: true });
    });

    it('should collect generated files for manifest', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      expect(result.success).toBe(true);
      expect(result.manifest.generatedFiles.length).toBeGreaterThan(0);

      const filePaths = result.manifest.generatedFiles.map((f) => f.path);
      expect(filePaths).toContain('types.d.ts');
      expect(filePaths).toContain('routes.ts');
    });

    it('should categorize file types correctly', async () => {
      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();

      const typeFile = result.manifest.generatedFiles.find((f) => f.path === 'types.d.ts');
      expect(typeFile?.type).toBe('type');

      const routeFile = result.manifest.generatedFiles.find((f) => f.path === 'routes.ts');
      expect(routeFile?.type).toBe('route');

      const openapiFile = result.manifest.generatedFiles.find((f) => f.path === 'openapi.json');
      expect(openapiFile?.type).toBe('openapi');

      const clientFile = result.manifest.generatedFiles.find((f) => f.path === 'client-sdk.ts');
      expect(clientFile?.type).toBe('client');
    });

    it('should write manifest.json to output directory', async () => {
      mkdirSync(defaultConfig.outputDir, { recursive: true });

      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });

      const result = await orchestrator.build();
      expect(result.success).toBe(true);

      const manifestPath = join(defaultConfig.outputDir, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      orchestrator = new BuildOrchestrator(defaultConfig);
      await expect(orchestrator.dispose()).resolves.toBeUndefined();
    });
  });

  // NOTE: This describe block MUST be the last one in this suite.
  // It modifies the module-level createCompiler mock in a way that
  // vi.restoreAllMocks() may not fully undo, which can break subsequent tests.
  describe('typecheck failures', () => {
    it('should fail when typecheck reports errors', async () => {
      const compilerMod = await import('@vertz/compiler');
      const mockCreate = compilerMod.createCompiler as Mock;
      const originalImpl = mockCreate.getMockImplementation();

      let callCount = 0;
      mockCreate.mockImplementation((...args: unknown[]) => {
        callCount++;
        if (callCount <= 1) {
          return originalImpl ? originalImpl(...args) : mockCreate.mock.results[0]?.value;
        }
        return {
          analyze: mock().mockResolvedValue({ modules: [] }),
          validate: mock().mockResolvedValue([
            {
              severity: 'error',
              message: 'Type mismatch',
              file: 'src/app.ts',
              line: 10,
              column: 5,
            },
          ]),
        };
      });

      orchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: true,
      });

      const result = await orchestrator.build();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Type checking failed');
      expect(result.stages.typecheck).toBe(false);
    });
  });
});

describe('BuildManifest', () => {
  it('should have required fields', () => {
    const manifest: BuildManifest = {
      entryPoint: 'src/app.ts',
      outputDir: '.vertz/build',
      generatedFiles: [],
      size: 0,
      buildTime: Date.now(),
      target: 'node',
    };

    expect(manifest.entryPoint).toBeDefined();
    expect(manifest.outputDir).toBeDefined();
    expect(manifest.generatedFiles).toBeDefined();
    expect(manifest.size).toBeDefined();
    expect(manifest.buildTime).toBeDefined();
  });
});
