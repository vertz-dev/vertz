import type { CSSExtractionResult } from '@vertz/ui-compiler';

export interface VertzBunPluginOptions {
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
}

/** CSS extractions tracked across all transformed files (for dead CSS elimination). */
export type FileExtractionsMap = Map<string, CSSExtractionResult>;

/** Map of source file path to CSS sidecar file path (for debugging). */
export type CSSSidecarMap = Map<string, string>;

export interface VertzBunPluginResult {
  /** The Bun plugin to pass to Bun.build or bunfig.toml. */
  plugin: import('bun').BunPlugin;
  /** CSS extractions for all transformed files (for production dead CSS elimination). */
  fileExtractions: FileExtractionsMap;
  /** Map of source file to CSS sidecar file path (for debugging). */
  cssSidecarMap: CSSSidecarMap;
}
