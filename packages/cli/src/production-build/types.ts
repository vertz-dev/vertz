/**
 * Build Types - Type definitions for production builds
 */

/**
 * Configuration for the build orchestrator
 */
export interface BuildConfig {
  /** Source directory */
  sourceDir: string;
  /** Output directory for built files */
  outputDir: string;
  /** Whether to run type checking */
  typecheck: boolean;
  /** Whether to minify the output */
  minify: boolean;
  /** Whether to generate sourcemaps */
  sourcemap: boolean;
  /** Build target (node, edge, worker) */
  target: BuildTarget;
  /** Entry point for the application */
  entryPoint: string;
}

/**
 * Build target platform
 */
export type BuildTarget = 'node' | 'edge' | 'worker';

/**
 * Status of each build stage
 */
export interface BuildStageStatus {
  codegen: boolean;
  typecheck: boolean;
  bundle: boolean;
}

/**
 * A generated file entry
 */
export interface GeneratedFile {
  path: string;
  size: number;
  type: 'type' | 'route' | 'openapi' | 'client';
}

/**
 * Build manifest - used by vertz publish
 */
export interface BuildManifest {
  /** Entry point file */
  entryPoint: string;
  /** Output directory */
  outputDir: string;
  /** List of generated files */
  generatedFiles: GeneratedFile[];
  /** Total size in bytes */
  size: number;
  /** Build timestamp (Unix ms) */
  buildTime: number;
  /** Build target */
  target: BuildTarget;
  /** Dependencies that were bundled */
  dependencies?: string[];
  /** Tree-shaken modules */
  treeShaken?: string[];
}

/**
 * Complete result from running the build
 */
export interface BuildResult {
  /** Whether the build succeeded */
  success: boolean;
  /** Status of each stage */
  stages: BuildStageStatus;
  /** Build manifest */
  manifest: BuildManifest;
  /** Error message if build failed */
  error?: string;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Default build configuration
 */
export const defaultBuildConfig: BuildConfig = {
  sourceDir: 'src',
  outputDir: '.vertz/build',
  typecheck: true,
  minify: true,
  sourcemap: false,
  target: 'node',
  entryPoint: 'src/app.ts',
};
