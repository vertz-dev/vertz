/**
 * Pipeline Orchestrator - Phase 1
 *
 * Unified `vertz dev` command that orchestrates:
 * 1. Analyze - runs @vertz/compiler to produce AppIR
 * 2. Generate - runs @vertz/codegen to emit types, route map, DB client
 * 3. Build UI - UI compilation (Vite/esbuild for now)
 * 4. Serve - dev server with HMR
 */

import { createCodegenPipeline, generate } from '@vertz/codegen';
import { createCompiler } from '@vertz/compiler';
/**
 * Default pipeline configuration
 */
export const defaultPipelineConfig = {
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
  config;
  compiler = null;
  appIR = null;
  isRunning = false;
  stages = new Map();
  constructor(config = {}) {
    this.config = { ...defaultPipelineConfig, ...config };
  }
  /**
   * Initialize the pipeline - create compiler instance
   */
  async initialize() {
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
  async runFull() {
    const startTime = performance.now();
    const stages = [];
    let success = true;
    try {
      // Stage 1: Analyze
      const analyzeResult = await this.runAnalyze();
      stages.push(analyzeResult);
      if (!analyzeResult.success) {
        success = false;
      }
      // Stage 2: Generate (only if analyze succeeded)
      if (success && this.appIR) {
        const generateResult = await this.runCodegen();
        stages.push(generateResult);
        if (!generateResult.success) {
          success = false;
        }
      }
      // Stage 3: Build UI (could run in parallel with other stages)
      // For now, we'll defer to the dev server to handle this
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
  async runStages(stages) {
    const startTime = performance.now();
    const results = [];
    for (const stage of stages) {
      let result;
      switch (stage) {
        case 'analyze':
          result = await this.runAnalyze();
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
  async runAnalyze() {
    const startTime = performance.now();
    if (!this.compiler) {
      await this.initialize();
    }
    try {
      this.appIR = await this.compiler.analyze();
      const diagnostics = await this.compiler.validate(this.appIR);
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
   * Run the codegen stage
   */
  async runCodegen() {
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
      const config = {
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
   * Run the UI build stage
   * Note: This currently delegates to Vite. In the future, this will use @vertz/ui-compiler directly.
   */
  async runBuildUI() {
    const startTime = performance.now();
    // TODO: Integrate @vertz/ui-compiler for component-level builds
    // For now, we just acknowledge the stage
    return {
      stage: 'build-ui',
      success: true,
      durationMs: performance.now() - startTime,
      output: 'UI build delegated to Vite',
    };
  }
  /**
   * Run the DB sync stage
   */
  async runDbSync() {
    const startTime = performance.now();
    // TODO: Integrate @vertz/db for schema sync
    // For now, we just acknowledge the stage
    return {
      stage: 'db-sync',
      success: true,
      durationMs: performance.now() - startTime,
      output: 'DB sync complete (noop for now)',
    };
  }
  /**
   * Get the current AppIR
   */
  getAppIR() {
    return this.appIR;
  }
  /**
   * Check if the pipeline is currently running
   */
  isPipelineRunning() {
    return this.isRunning;
  }
  /**
   * Get the latest result for a specific stage
   */
  getStageResult(stage) {
    return this.stages.get(stage);
  }
  /**
   * Clean up resources
   */
  async dispose() {
    this.compiler = null;
    this.appIR = null;
    this.stages.clear();
  }
}
/**
 * Create a new pipeline orchestrator
 */
export function createPipelineOrchestrator(config) {
  return new PipelineOrchestrator(config);
}
//# sourceMappingURL=orchestrator.js.map
