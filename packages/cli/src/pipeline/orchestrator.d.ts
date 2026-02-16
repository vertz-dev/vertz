/**
 * Pipeline Orchestrator - Phase 1
 *
 * Unified `vertz dev` command that orchestrates:
 * 1. Analyze - runs @vertz/compiler to produce AppIR
 * 2. Generate - runs @vertz/codegen to emit types, route map, DB client
 * 3. Build UI - UI compilation (Vite/esbuild for now)
 * 4. Serve - dev server with HMR
 */
import type { AppIR } from '@vertz/compiler';
import type { GenerateResult } from '@vertz/codegen';
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
export declare const defaultPipelineConfig: PipelineConfig;
/**
 * Pipeline Orchestrator
 *
 * Coordinates the full development pipeline:
 * 1. Analyze (compiler → AppIR)
 * 2. Generate (codegen → types, route map, DB client)
 * 3. Build UI (components → ES modules)
 * 4. Serve (dev server with HMR)
 */
export declare class PipelineOrchestrator {
  private config;
  private compiler;
  private appIR;
  private isRunning;
  private stages;
  constructor(config?: Partial<PipelineConfig>);
  /**
   * Initialize the pipeline - create compiler instance
   */
  initialize(): Promise<void>;
  /**
   * Run the full pipeline once
   */
  runFull(): Promise<PipelineResult>;
  /**
   * Run specific stages based on file changes
   */
  runStages(stages: PipelineStage[]): Promise<PipelineResult>;
  /**
   * Run the analyze stage
   */
  private runAnalyze;
  /**
   * Run the codegen stage
   */
  private runCodegen;
  /**
   * Run the UI build stage
   * Note: This currently delegates to Vite. In the future, this will use @vertz/ui-compiler directly.
   */
  private runBuildUI;
  /**
   * Run the DB sync stage
   */
  private runDbSync;
  /**
   * Get the current AppIR
   */
  getAppIR(): AppIR | null;
  /**
   * Check if the pipeline is currently running
   */
  isPipelineRunning(): boolean;
  /**
   * Get the latest result for a specific stage
   */
  getStageResult(stage: PipelineStage): StageResult | undefined;
  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
/**
 * Create a new pipeline orchestrator
 */
export declare function createPipelineOrchestrator(
  config?: Partial<PipelineConfig>,
): PipelineOrchestrator;
//# sourceMappingURL=orchestrator.d.ts.map
