import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { type PipelineConfig, PipelineOrchestrator } from '../orchestrator';

// Mock the compiler and codegen modules
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
    it('should run the full pipeline including db-sync', async () => {
      const result = await orchestrator.runFull();

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(4); // analyze + db-sync + codegen + openapi
      expect(result.stages.map((s) => s.stage)).toContain('analyze');
      expect(result.stages.map((s) => s.stage)).toContain('db-sync');
      expect(result.stages.map((s) => s.stage)).toContain('codegen');
      expect(result.stages.map((s) => s.stage)).toContain('openapi');
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
      expect(result.stages[0]?.stage).toBe('analyze');
    });

    it('should run codegen stage', async () => {
      // First run analyze to have AppIR
      await orchestrator.runStages(['analyze']);

      const result = await orchestrator.runStages(['codegen']);

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(1);
      expect(result.stages[0]?.stage).toBe('codegen');
    });

    it('should run multiple stages', async () => {
      const result = await orchestrator.runStages(['analyze', 'codegen']);

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(2);
    });

    it('should run build-ui stage', async () => {
      const result = await orchestrator.runStages(['build-ui']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.stage).toBe('build-ui');
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

  describe('db-sync stage', () => {
    it('should skip db-sync when autoSyncDb is false', async () => {
      const result = await orchestrator.runStages(['db-sync']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.stage).toBe('db-sync');
      expect(result.stages[0]?.output).toContain('skipped');
    });

    it('should attempt db-sync when autoSyncDb is true', async () => {
      const dbOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: true,
        port: 3000,
        host: 'localhost',
      });

      const result = await dbOrchestrator.runStages(['db-sync']);

      // Should not crash — returns success (skipped) or failure with error
      expect(result.stages[0]?.stage).toBe('db-sync');
      // Without a vertz.config.ts, it should skip gracefully
      expect(result.success).toBe(true);
      expect(result.stages[0]?.output).toContain('skipped');

      await dbOrchestrator.dispose();
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
