import type { CSSExtractionResult } from '../compiler/css/types';
import type { DebugLogger } from '../debug-logger';
import type { DiagnosticsCollector } from '../diagnostics-collector';

export interface VertzBuildPluginOptions {
  /** Regex filter for files to transform. Defaults to .tsx files. */
  filter?: RegExp;
  /** Compilation target. 'dom' (default) or 'tui'. */
  target?: 'dom' | 'tui';
  /**
   * Directory for CSS sidecar files.
   * Defaults to `.vertz/css` relative to the project root.
   */
  cssOutDir?: string;
  /** Enable HMR support (import.meta.hot.accept). Defaults to true. */
  hmr?: boolean;
  /**
   * Enable Fast Refresh (component-level HMR).
   * When true, components are wrapped with tracking code and re-mounted
   * on file change instead of doing a full page reload.
   * Defaults to true when hmr is true.
   */
  fastRefresh?: boolean;
  /** Project root for computing relative paths. */
  projectRoot?: string;
  /** Source directory for manifest generation pre-pass. Defaults to `src/` relative to projectRoot. */
  srcDir?: string;
  /** Debug logger for opt-in diagnostic logging. */
  logger?: DebugLogger;
  /** Diagnostics collector for the health check endpoint. */
  diagnostics?: DiagnosticsCollector;
  /**
   * Path to entity-schema.json from codegen.
   * When provided, enables relation-aware field selection injection
   * (include for relations, hidden field filtering, custom primary keys).
   * Defaults to `<projectRoot>/.vertz/generated/entity-schema.json`.
   */
  entitySchemaPath?: string;
  /**
   * Auto-split route component factories into lazy imports for code splitting.
   * When true, `defineRoutes()` component factories referencing static imports
   * are rewritten to `import()` calls at build time.
   * Defaults to false (enabled explicitly for production client builds).
   */
  routeSplitting?: boolean;
}

/** CSS extractions tracked across all transformed files (for dead CSS elimination). */
export type FileExtractionsMap = Map<string, CSSExtractionResult>;

/** Map of source file path to CSS sidecar file path (for debugging). */
export type CSSSidecarMap = Map<string, string>;

/** Result of updating a single file's manifest during HMR. */
export interface ManifestUpdateResult {
  /** Whether the manifest's reactivity shape changed compared to the previous version. */
  changed: boolean;
}

/**
 * Result of `createVertzBuildPlugin()`.
 *
 * Note: `plugin` is typed as `BunPlugin` for structural compatibility with the
 * production build toolchain (vtz build consumes the BunPlugin shape internally).
 * The factory name uses "Build" — not "Bun" — because its purpose (production
 * build integration), not its runtime, drives the name. Dev is vtz; only the
 * production build pipeline consumes this.
 */
export interface VertzBuildPluginResult {
  /** The production-build plugin (BunPlugin-shaped for toolchain compatibility). */
  plugin: import('bun').BunPlugin;
  /** CSS extractions for all transformed files (for production dead CSS elimination). */
  fileExtractions: FileExtractionsMap;
  /** Map of source file to CSS sidecar file path (for debugging). */
  cssSidecarMap: CSSSidecarMap;
  /**
   * Regenerate a single file's manifest during HMR.
   * Returns whether the manifest shape changed (triggering cache invalidation).
   */
  updateManifest(filePath: string, sourceText: string): ManifestUpdateResult;
  /**
   * Remove a file's manifest when the file is deleted.
   * Returns whether the file had a manifest entry.
   */
  deleteManifest(filePath: string): boolean;
  /**
   * Reload the entity schema manifest from disk.
   * Call this when entity-schema.json changes (e.g., after codegen re-runs).
   * Returns whether the schema changed.
   */
  reloadEntitySchema(): boolean;
}
