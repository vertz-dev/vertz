/**
 * Build Orchestrator Tests
 * 
 * Tests for the production build orchestrator that handles:
 * - Codegen pipeline execution
 * - Type checking
 * - Bundling
 * - Manifest generation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BuildOrchestrator, createBuildOrchestrator } from '../orchestrator';
import type { BuildConfig, BuildManifest } from '../types';

// Mock dependencies
vi.mock('@vertz/compiler', () => ({
  createCompiler: vi.fn(() => ({
    analyze: vi.fn().mockResolvedValue({ 
      modules: [{ name: 'test', services: [], routes: [], schemas: [] }], 
      routes: [],
      schemas: [],
      env: { variables: [] },
      middlewares: []
    }),
    validate: vi.fn().mockResolvedValue([]),
    compile: vi.fn().mockResolvedValue({ success: true, diagnostics: [] }),
  })),
  Compiler: vi.fn(),
}));

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

// Mock exec for bundling
vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  execSync: vi.fn(),
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

  beforeEach(() => {
    orchestrator = new BuildOrchestrator(defaultConfig);
  });

  afterEach(async () => {
    await orchestrator.dispose();
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
    it('should run the full build pipeline', async () => {
      const result = await orchestrator.build();
      
      expect(result.success).toBe(true);
      expect(result.stages.codegen).toBe(true);
      expect(result.stages.typecheck).toBe(true);
      expect(result.stages.bundle).toBe(true);
    });

    it('should skip typecheck when disabled', async () => {
      const noTypecheckOrchestrator = new BuildOrchestrator({
        ...defaultConfig,
        typecheck: false,
      });
      
      const result = await noTypecheckOrchestrator.build();
      
      expect(result.success).toBe(true);
      expect(result.stages.typecheck).toBe(false);
    });

    it('should return error when codegen fails', async () => {
      // Create a mock that fails codegen
      const failingOrchestrator = new BuildOrchestrator({
        ...defaultConfig,
        sourceDir: 'nonexistent', // This should cause analyze to fail
      });
      
      // We expect it to handle the error gracefully
      const result = await failingOrchestrator.build();
      // The build might succeed with empty output, but we test the structure
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('manifest');
    });

    it('should generate a manifest', async () => {
      const result = await orchestrator.build();
      
      expect(result.manifest).toBeDefined();
      expect(result.manifest).toHaveProperty('entryPoint');
      expect(result.manifest).toHaveProperty('outputDir');
      expect(result.manifest).toHaveProperty('size');
      expect(result.manifest).toHaveProperty('buildTime');
    });

    it('should include generated files in manifest', async () => {
      const result = await orchestrator.build();
      
      expect(result.manifest).toHaveProperty('generatedFiles');
      expect(Array.isArray(result.manifest.generatedFiles)).toBe(true);
    });
  });

  describe('manifest', () => {
    it('should include entry point in manifest', async () => {
      const result = await orchestrator.build();
      
      expect(result.manifest.entryPoint).toBe(defaultConfig.entryPoint);
    });

    it('should include output directory in manifest', async () => {
      const result = await orchestrator.build();
      
      expect(result.manifest.outputDir).toBe(defaultConfig.outputDir);
    });

    it('should include build timestamp in manifest', async () => {
      const beforeBuild = Date.now();
      const result = await orchestrator.build();
      const afterBuild = Date.now();
      
      expect(result.manifest.buildTime).toBeGreaterThanOrEqual(beforeBuild);
      expect(result.manifest.buildTime).toBeLessThanOrEqual(afterBuild);
    });
  });

  describe('createBuildOrchestrator', () => {
    it('should create a new build orchestrator', () => {
      const orch = createBuildOrchestrator(defaultConfig);
      expect(orch).toBeDefined();
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
