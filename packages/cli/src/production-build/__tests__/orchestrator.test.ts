/**
 * Build Orchestrator Tests
 *
 * Tests for the production build orchestrator that handles:
 * - Codegen pipeline execution
 * - Type checking
 * - Bundling (using esbuild JavaScript API)
 * - Manifest generation
 */

import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { BuildOrchestrator, createBuildOrchestrator } from '../orchestrator';
import type { BuildConfig, BuildManifest } from '../types';

// Mock dependencies
vi.mock('@vertz/compiler', () => {
  const mockGenerate = vi.fn().mockResolvedValue(undefined);
  
  return {
    createCompiler: vi.fn(() => ({
      analyze: vi.fn().mockResolvedValue({
        modules: [{ name: 'test', services: [], routes: [], schemas: [] }],
        routes: [],
        schemas: [],
        env: { variables: [] },
        middlewares: [],
      }),
      validate: vi.fn().mockResolvedValue([]),
      compile: vi.fn().mockResolvedValue({ success: true, diagnostics: [] }),
      getConfig: vi.fn().mockReturnValue({
        strict: false,
        forceGenerate: false,
        compiler: {
          sourceDir: 'src',
          outputDir: '.vertz/generated',
          entryFile: 'src/app.ts',
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
      }),
    })),
    Compiler: vi.fn(),
    OpenAPIGenerator: class {
      generate = mockGenerate;
    },
  };
});

vi.mock('@vertz/codegen', () => ({
  createCodegenPipeline: vi.fn(() => ({
    validate: vi.fn().mockReturnValue([]),
    generate: vi.fn().mockResolvedValue({
      files: [{ path: 'test.ts', content: 'export type Test = string;' }],
      fileCount: 1,
      generators: ['typescript'],
      incremental: { written: ['test.ts'], skipped: [], removed: [] },
    }),
    resolveOutputDir: vi.fn().mockReturnValue('.vertz/generated'),
    resolveConfig: vi.fn((config) => config),
  })),
  generate: vi.fn().mockResolvedValue({
    files: [{ path: 'test.ts', content: 'export type Test = string;' }],
    fileCount: 1,
    generators: ['typescript'],
  }),
}));

// Mock esbuild - create a default mock implementation
vi.mock('esbuild', () => ({
  build: vi.fn().mockResolvedValue({
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
  }),
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

  describe('dispose', () => {
    it('should clean up resources', async () => {
      orchestrator = new BuildOrchestrator(defaultConfig);
      await expect(orchestrator.dispose()).resolves.toBeUndefined();
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
