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

const mockCreateVertzBunPlugin = vi.fn(() => ({
  plugin: { name: 'vertz-bun-plugin', setup: vi.fn() },
  fileExtractions: new Map(),
  cssSidecarMap: new Map(),
  updateManifest: vi.fn(() => ({ changed: false })),
  deleteManifest: vi.fn(() => false),
  reloadEntitySchema: vi.fn(() => false),
}));

vi.mock('@vertz/ui-server/bun-plugin', () => ({
  createVertzBunPlugin: mockCreateVertzBunPlugin,
}));

const mockRun = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

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
      _uiCompilerValidator: async () => ({ fileCount: 5 }),
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
    it('should run the full pipeline including db-sync and build-ui', async () => {
      const result = await orchestrator.runFull();

      expect(result.success).toBe(true);
      expect(result.stages).toHaveLength(5); // analyze + db-sync + codegen + openapi + build-ui
      const stageNames = result.stages.map((s) => s.stage);
      expect(stageNames).toContain('analyze');
      expect(stageNames).toContain('db-sync');
      expect(stageNames).toContain('codegen');
      expect(stageNames).toContain('openapi');
      expect(stageNames).toContain('build-ui');
      // db-sync must run before codegen
      expect(stageNames.indexOf('db-sync')).toBeLessThan(stageNames.indexOf('codegen'));
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

    it('should run build-ui stage with real compiler validation', async () => {
      const result = await orchestrator.runStages(['build-ui']);

      expect(result.stages[0]?.stage).toBe('build-ui');
      // Must NOT return the old placeholder output
      expect(result.stages[0]?.output).not.toBe('UI build delegated to Vite');
    });
  });

  describe('build-ui stage', () => {
    it('should report success with file count when using injected validator', async () => {
      const result = await orchestrator.runStages(['build-ui']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.stage).toBe('build-ui');
      expect(result.stages[0]?.output).toBe('UI compiler validated (5 source files)');
    });

    it('should report failure when injected validator throws', async () => {
      const failingOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: false,
        port: 3000,
        host: 'localhost',
        _uiCompilerValidator: async () => {
          throw new Error('Framework manifest not found');
        },
      });

      const result = await failingOrchestrator.runStages(['build-ui']);

      expect(result.success).toBe(false);
      expect(result.stages[0]?.stage).toBe('build-ui');
      expect(result.stages[0]?.error?.message).toBe('Framework manifest not found');

      await failingOrchestrator.dispose();
    });

    it('should call createVertzBunPlugin when no injected validator is provided', async () => {
      mockCreateVertzBunPlugin.mockClear();

      const noValidatorOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: false,
        port: 3000,
        host: 'localhost',
      });

      const result = await noValidatorOrchestrator.runStages(['build-ui']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.output).toBe('UI compiler validated');
      expect(mockCreateVertzBunPlugin).toHaveBeenCalledWith({
        hmr: false,
        fastRefresh: false,
      });

      await noValidatorOrchestrator.dispose();
    });

    it('should report failure when createVertzBunPlugin throws', async () => {
      mockCreateVertzBunPlugin.mockImplementationOnce(() => {
        throw new Error('Cannot find module @vertz/ui/reactivity.json');
      });

      const noValidatorOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: false,
        port: 3000,
        host: 'localhost',
      });

      const result = await noValidatorOrchestrator.runStages(['build-ui']);

      expect(result.success).toBe(false);
      expect(result.stages[0]?.error?.message).toBe('Cannot find module @vertz/ui/reactivity.json');

      await noValidatorOrchestrator.dispose();
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
    beforeEach(() => {
      mockRun.mockReset().mockResolvedValue(undefined);
      mockClose.mockReset().mockResolvedValue(undefined);
    });

    it('should skip db-sync when autoSyncDb is false', async () => {
      const result = await orchestrator.runStages(['db-sync']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.stage).toBe('db-sync');
      expect(result.stages[0]?.output).toContain('skipped');
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('should skip gracefully when runner factory throws', async () => {
      const dbOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: true,
        port: 3000,
        host: 'localhost',
        _dbSyncRunner: async () => {
          throw new Error('No valid `db` config');
        },
      });

      const result = await dbOrchestrator.runStages(['db-sync']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.output).toContain('skipped');
      expect(mockRun).not.toHaveBeenCalled();

      await dbOrchestrator.dispose();
    });

    it('should run db-sync when config exists and autoSyncDb is true', async () => {
      const dbOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: true,
        port: 3000,
        host: 'localhost',
        _dbSyncRunner: async () => ({ run: mockRun, close: mockClose }),
      });

      const result = await dbOrchestrator.runStages(['db-sync']);

      expect(result.success).toBe(true);
      expect(result.stages[0]?.output).toBe('DB sync complete');
      expect(mockRun).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();

      await dbOrchestrator.dispose();
    });

    it('should close connection even when run throws', async () => {
      mockRun.mockRejectedValue(new Error('Migration failed'));

      const dbOrchestrator = new PipelineOrchestrator({
        sourceDir: 'src',
        outputDir: '.vertz/generated',
        typecheck: false,
        autoSyncDb: true,
        port: 3000,
        host: 'localhost',
        _dbSyncRunner: async () => ({ run: mockRun, close: mockClose }),
      });

      const result = await dbOrchestrator.runStages(['db-sync']);

      expect(result.success).toBe(false);
      expect(result.stages[0]?.error?.message).toBe('Migration failed');
      expect(mockClose).toHaveBeenCalled();

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
