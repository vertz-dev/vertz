/**
 * Pipeline Orchestrator - Phase 1
 *
 * Unified `vertz dev` command that orchestrates:
 * 1. Analyze - runs @vertz/compiler to produce AppIR
 * 2. Generate - runs @vertz/codegen to emit types, route map, DB client
 * 3. Build UI - UI compiler validation via @vertz/ui-server/bun-plugin
 * 4. Serve - dev server with HMR
 */

import type { CodegenConfig, GenerateResult } from '@vertz/codegen';
import { createCodegenPipeline, generate } from '@vertz/codegen';
import type { AppIR } from '@vertz/compiler';
import { type Compiler, createCompiler, OpenAPIGenerator } from '@vertz/compiler';
import type { VertzBunPluginOptions } from '@vertz/ui-server/bun-plugin';
import type { PipelineStage } from './types';

/**
 * Configuration for the pipeline orchestrator
 */
export interface PipelineConfig {
  /** Source directory */
  sourceDir: string;
  /** Output directory for generated files */
  outputDir: string;
  /** Whether to enable type checking */
  typecheck: boolean;
  /** Whether to auto-sync DB schema in dev mode */
  autoSyncDb: boolean;
  /** Whether to open browser on start */
  open: boolean;
  /** Port for dev server */
  port: number;
  /** @internal — override for testing */
  _dbSyncRunner?: () => Promise<{ run: () => Promise<void>; close: () => Promise<void> }>;
  /** @internal — override UI compiler validation for testing */
  _uiCompilerValidator?: () => Promise<{ fileCount: number }>;
  /** Host for dev server */
  host: string;
}

/**
 * Result from running a pipeline stage
 */
export interface StageResult {
  stage: PipelineStage;
  success: boolean;
  durationMs: number;
  error?: Error;
  output?: string;
}

/**
 * Complete result from running the pipeline
 */
export interface PipelineResult {
  success: boolean;
  stages: StageResult[];
  totalDurationMs: number;
  appIR?: AppIR;
  generatedFiles?: GenerateResult;
}

/**
 * Default pipeline configuration
 */
export const defaultPipelineConfig: PipelineConfig = {
  sourceDir: 'src',
  outputDir: '.vertz/generated',
  typecheck: true,
  autoSyncDb: true,
  open: false,
  port: 3000,
  host: 'localhost',
};

/**
 * Pipeline Orchestrator
 *
 * Coordinates the full development pipeline:
 * 1. Analyze (compiler → AppIR)
 * 2. Generate (codegen → types, route map, DB client)
 * 3. Build UI (components → ES modules)
 * 4. Serve (dev server with HMR)
 */
export class PipelineOrchestrator {
  private config: PipelineConfig;
  private compiler: Compiler | null = null;
  private appIR: AppIR | null = null;
  private isRunning = false;
  private stages: Map<PipelineStage, StageResult> = new Map();

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...defaultPipelineConfig, ...config };
  }

  /**
   * Initialize the pipeline - create compiler instance
   */
  async initialize(): Promise<void> {
    this.compiler = createCompiler({
      strict: false,
      forceGenerate: false,
      compiler: {
        sourceDir: this.config.sourceDir,
        outputDir: this.config.outputDir,
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
    });
  }

  /**
   * Run the full pipeline once
   */
  async runFull(): Promise<PipelineResult> {
    const startTime = performance.now();
    const stages: StageResult[] = [];
    let success = true;

    try {
      // Stage 1: Analyze
      const analyzeResult = await this.runAnalyze();
      stages.push(analyzeResult);
      if (!analyzeResult.success) {
        success = false;
      }

      // Stage 2: DB sync (auto-migrate before codegen so DB schema is current)
      if (success) {
        const dbSyncResult = await this.runDbSync();
        stages.push(dbSyncResult);
        if (!dbSyncResult.success) {
          success = false;
        }
      }

      // Stage 3: Generate code (types, route map, DB client)
      // OpenAPI depends on the IR being ready from codegen
      if (success && this.appIR) {
        const generateResult = await this.runCodegen();
        stages.push(generateResult);
        if (!generateResult.success) {
          success = false;
        }
      }

      // Stage 4: Generate OpenAPI spec (only if codegen succeeded)
      if (success && this.appIR) {
        const openapiResult = await this.runOpenAPIGenerate();
        stages.push(openapiResult);
        if (!openapiResult.success) {
          success = false;
        }
      }

      // Stage 5: Validate UI compiler contract
      if (success) {
        const buildUIResult = await this.runBuildUI();
        stages.push(buildUIResult);
        if (!buildUIResult.success) {
          success = false;
        }
      }
    } catch (error) {
      success = false;
      stages.push({
        stage: 'analyze',
        success: false,
        durationMs: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    return {
      success,
      stages,
      totalDurationMs: performance.now() - startTime,
      appIR: this.appIR ?? undefined,
    };
  }

  /**
   * Run specific stages based on file changes
   */
  async runStages(stages: PipelineStage[]): Promise<PipelineResult> {
    const startTime = performance.now();
    const results: StageResult[] = [];

    for (const stage of stages) {
      let result: StageResult;

      switch (stage) {
        case 'analyze':
          result = await this.runAnalyze();
          break;
        case 'openapi':
          result = await this.runOpenAPIGenerate();
          break;
        case 'codegen':
          result = await this.runCodegen();
          break;
        case 'build-ui':
          result = await this.runBuildUI();
          break;
        case 'db-sync':
          result = await this.runDbSync();
          break;
        default:
          continue;
      }

      results.push(result);
      this.stages.set(stage, result);
    }

    const allSuccess = results.every((r) => r.success);

    return {
      success: allSuccess,
      stages: results,
      totalDurationMs: performance.now() - startTime,
      appIR: this.appIR ?? undefined,
    };
  }

  /**
   * Run the analyze stage
   */
  private async runAnalyze(): Promise<StageResult> {
    const startTime = performance.now();

    if (!this.compiler) {
      await this.initialize();
    }

    try {
      this.appIR = await this.compiler!.analyze();
      const diagnostics = await this.compiler!.validate(this.appIR);
      const hasErrors = diagnostics.some((d) => d.severity === 'error');

      return {
        stage: 'analyze',
        success: !hasErrors,
        durationMs: performance.now() - startTime,
        output: hasErrors
          ? `${diagnostics.filter((d) => d.severity === 'error').length} errors`
          : 'Analysis complete',
      };
    } catch (error) {
      return {
        stage: 'analyze',
        success: false,
        durationMs: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Run the OpenAPI generation stage
   */
  private async runOpenAPIGenerate(): Promise<StageResult> {
    const startTime = performance.now();

    if (!this.appIR) {
      return {
        stage: 'openapi',
        success: false,
        durationMs: performance.now() - startTime,
        error: new Error('No AppIR available. Run analyze first.'),
      };
    }

    try {
      // Only generate OpenAPI spec, not all generators
      const config = this.compiler!.getConfig();
      const openApiGenerator = new OpenAPIGenerator(config);
      await openApiGenerator.generate(this.appIR, config.compiler.outputDir);

      return {
        stage: 'openapi',
        success: true,
        durationMs: performance.now() - startTime,
        output: 'OpenAPI spec generated',
      };
    } catch (error) {
      return {
        stage: 'openapi',
        success: false,
        durationMs: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Run the codegen stage
   */
  private async runCodegen(): Promise<StageResult> {
    const startTime = performance.now();

    if (!this.appIR) {
      return {
        stage: 'codegen',
        success: false,
        durationMs: performance.now() - startTime,
        error: new Error('No AppIR available. Run analyze first.'),
      };
    }

    try {
      const pipeline = createCodegenPipeline();

      // For now, use basic typescript generator config
      const config: CodegenConfig = {
        generators: ['typescript'],
        outputDir: this.config.outputDir,
        format: true,
        incremental: true,
      };

      const resolvedConfig = pipeline.resolveConfig(config);
      const result = await generate(this.appIR, resolvedConfig);

      return {
        stage: 'codegen',
        success: true,
        durationMs: performance.now() - startTime,
        output: `Generated ${result.fileCount} files`,
      };
    } catch (error) {
      return {
        stage: 'codegen',
        success: false,
        durationMs: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Run the UI build stage.
   *
   * In dev mode this validates that the UI compiler contract
   * (`createVertzBunPlugin` from `@vertz/ui-server/bun-plugin`) is available
   * and can initialize (manifest generation, framework manifest loading).
   * The actual per-file compilation happens on-demand in the dev server's
   * bun plugin `onLoad` hook.
   */
  private async runBuildUI(): Promise<StageResult> {
    const startTime = performance.now();

    try {
      if (this.config._uiCompilerValidator) {
        const result = await this.config._uiCompilerValidator();
        return {
          stage: 'build-ui',
          success: true,
          durationMs: performance.now() - startTime,
          output: `UI compiler validated (${result.fileCount} source files)`,
        };
      }

      // Validate that the UI compiler contract is importable and can initialize.
      // The plugin instance is not shared with the dev server — the cost of a
      // duplicate `generateAllManifests()` pass is acceptable at startup.
      const { createVertzBunPlugin } = await import('@vertz/ui-server/bun-plugin');
      const pluginOptions: VertzBunPluginOptions = {
        hmr: false,
        fastRefresh: false,
      };
      createVertzBunPlugin(pluginOptions);

      return {
        stage: 'build-ui',
        success: true,
        durationMs: performance.now() - startTime,
        output: 'UI compiler validated',
      };
    } catch (error) {
      return {
        stage: 'build-ui',
        success: false,
        durationMs: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Run the DB sync stage
   */
  private async runDbSync(): Promise<StageResult> {
    const startTime = performance.now();

    if (!this.config.autoSyncDb) {
      return {
        stage: 'db-sync',
        success: true,
        durationMs: performance.now() - startTime,
        output: 'DB sync skipped (disabled)',
      };
    }

    let runner: { run: () => Promise<void>; close: () => Promise<void> } | undefined;
    try {
      if (this.config._dbSyncRunner) {
        runner = await this.config._dbSyncRunner();
      } else {
        const { loadAutoMigrateContext } = await import('../commands/load-db-context');
        const ctx = await loadAutoMigrateContext();
        const { autoMigrate } = await import('@vertz/db/internals');
        runner = {
          run: () =>
            autoMigrate({
              currentSchema: ctx.currentSchema,
              snapshotPath: ctx.snapshotPath,
              dialect: ctx.dialect,
              db: ctx.db,
            }),
          close: ctx.close,
        };
      }
    } catch {
      // No db config or schema — skip gracefully (e.g., UI-only projects)
      return {
        stage: 'db-sync',
        success: true,
        durationMs: performance.now() - startTime,
        output: 'DB sync skipped (no db config)',
      };
    }

    try {
      await runner.run();

      return {
        stage: 'db-sync',
        success: true,
        durationMs: performance.now() - startTime,
        output: 'DB sync complete',
      };
    } catch (error) {
      return {
        stage: 'db-sync',
        success: false,
        durationMs: performance.now() - startTime,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    } finally {
      try {
        await runner.close();
      } catch {
        // Connection cleanup failure should not mask migration errors
      }
    }
  }

  /**
   * Get the current AppIR
   */
  getAppIR(): AppIR | null {
    return this.appIR;
  }

  /**
   * Check if the pipeline is currently running
   */
  isPipelineRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the latest result for a specific stage
   */
  getStageResult(stage: PipelineStage): StageResult | undefined {
    return this.stages.get(stage);
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.compiler = null;
    this.appIR = null;
    this.stages.clear();
  }
}

/**
 * Create a new pipeline orchestrator
 */
export function createPipelineOrchestrator(config?: Partial<PipelineConfig>): PipelineOrchestrator {
  return new PipelineOrchestrator(config);
}
