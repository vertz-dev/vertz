import type { Plugin } from 'esbuild';

export interface BuildConfig {
  /** Entry point files relative to package root */
  entry: string[];
  /** Generate .d.ts declaration files (default: true) */
  dts?: boolean;
  /** Output directory (default: 'dist') */
  outDir?: string;
  /** External dependencies (auto-detected from package.json) */
  external?: string[];
  /** esbuild plugins for transform-time hooks (onLoad, onResolve) */
  plugins?: Plugin[];
  /** Post-build hooks — run after bundling, before DTS generation */
  onSuccess?: PostBuildHook | PostBuildHook[] | (() => void | Promise<void>);
  /** Remove outDir before building (default: false) */
  clean?: boolean;
  /** Build target (default: 'neutral') */
  target?: 'browser' | 'node' | 'neutral';
  /** Banner to prepend to output files */
  banner?: string | { js?: string; css?: string };
}

export interface PostBuildHook {
  name: string;
  handler: (ctx: PostBuildContext) => void | Promise<void>;
}

export interface PostBuildContext {
  outputFiles: OutputFileInfo[];
  outDir: string;
  packageJson: Record<string, unknown>;
}

export interface OutputFileInfo {
  path: string;
  relativePath: string;
  entrypoint: string | undefined;
  kind: 'entry-point' | 'chunk';
  size: number;
}
