import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PipelineOrchestrator, type PipelineConfig } from '../orchestrator';
import type { PipelineStage } from '../types';

// Mock the compiler and codegen modules
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
    generate: vi.fn().mockReturnValue({
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
    ir: { modules: [], schemas: [] },
  }),
}));

describe('PipelineOrchestrator', () => {
  let orchestrator: PipelineOrchestrator;

  beforeEach(() => {
    orchestrator = new PipelineOrchestrator({
      sourceDir: 'src',
      outputDir: '.vertz/generated',
      typecheck: false,
      autoSyncDb: false,
      port: 3000,
      host: 'localhost',
    });
  });

  afterEach(async () => {
    await orchestrator.dispose();
  });

  describe('initialization', () => {
    it('should create an orchestrator with default config', () => {
      const defaultOrchestrator = new PipelineOrchestrator();
      expect(defaultOrchestrator).toBeDefined();
    });

    it('should accept custom config', () => {
      const config: Partial<PipelineConfig> = {
        sourceDir: 'my-source',
        outputDir: 'my-output',
        port: 4000,
      };
      const customOrchestrator = new PipelineOrchestrator(config);
      expect(customOrchestrator).toBeDefined();
    });
  });

  describe('runFull', () => {
    it('should run the full pipeline', async () => {
      const result = await orchestrator.runFull();
      
      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(2); // analyze + codegen
      expect(result.stages.map(s => s.stage)).toContain('analyze');
      expect(result.stages.map(s => s.stage)).toContain('codegen');
    });

    it('should return AppIR after successful analysis', async () => {
      const result = await orchestrator.runFull();
      
      expect(result.appIR).toBeDefined();
    });
  });

  describe('runStages', () => {
    it('should run analyze stage', async () => {
      const result = await orchestrator.runStages(['analyze']);
      
      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0]!.stage).toBe('analyze');
    });

    it('should run codegen stage', async () => {
      // First run analyze to have AppIR
      await orchestrator.runStages(['analyze']);
      
      const result = await orchestrator.runStages(['codegen']);
      
      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0]!.stage).toBe('codegen');
    });

    it('should run multiple stages', async () => {
      const result = await orchestrator.runStages(['analyze', 'codegen']);
      
      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(2);
    });

    it('should run build-ui stage', async () => {
      const result = await orchestrator.runStages(['build-ui']);
      
      expect(result.success).toBe(true);
      expect(result.stages[0]!.stage).toBe('build-ui');
    });
  });

  describe('getStageResult', () => {
    it('should return undefined for unknown stage', () => {
      const result = orchestrator.getStageResult('analyze');
      expect(result).toBeUndefined();
    });

    it('should return result after running stage', async () => {
      await orchestrator.runStages(['analyze']);
      
      const result = orchestrator.getStageResult('analyze');
      
      expect(result).toBeDefined();
      expect(result?.stage).toBe('analyze');
      expect(result?.success).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      await orchestrator.runFull();
      await orchestrator.dispose();
      
      // After dispose, running stages should re-initialize
      const result = await orchestrator.runStages(['analyze']);
      expect(result.success).toBe(true);
    });
  });
});
