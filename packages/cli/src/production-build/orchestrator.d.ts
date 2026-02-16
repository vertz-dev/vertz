/**
 * Build Orchestrator - Production Build Pipeline
 *
 * Coordinates the full production build:
 * 1. Codegen - runs the pipeline to generate types, routes, OpenAPI
 * 2. Typecheck - runs TypeScript compiler
 * 3. Bundle - uses Bun/esbuild to create production bundle
 * 4. Manifest - generates build manifest
 */
import type { BuildConfig, BuildResult } from './types';
/**
 * Build Orchestrator
 *
 * Coordinates the full production build pipeline
 */
export declare class BuildOrchestrator {
  private config;
  private pipeline;
  private compiler;
  constructor(config?: Partial<BuildConfig>);
  /**
   * Run the full production build
   */
  build(): Promise<BuildResult>;
  /**
   * Run the codegen pipeline
   */
  private runCodegen;
  /**
   * Run TypeScript type checking
   */
  private runTypecheck;
  /**
   * Bundle the application using esbuild JavaScript API
   */
  private runBundle;
  /**
   * Get esbuild target string
   */
  private getEsbuildTarget;
  /**
   * Collect generated files for manifest
   */
  private collectGeneratedFiles;
  /**
   * Determine file type from filename
   */
  private getFileType;
  /**
   * Write manifest to file
   */
  private writeManifest;
  /**
   * Create a failure result
   */
  private createFailureResult;
  /**
   * Clean up resources
   */
  dispose(): Promise<void>;
}
/**
 * Create a new build orchestrator
 */
export declare function createBuildOrchestrator(config?: Partial<BuildConfig>): BuildOrchestrator;
//# sourceMappingURL=orchestrator.d.ts.map
