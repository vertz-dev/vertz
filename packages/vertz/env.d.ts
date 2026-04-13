/**
 * Vertz runtime environment type augmentations.
 *
 * Include in your tsconfig.json:
 *   "types": ["vertz/env"]
 *
 * Or add a triple-slash reference:
 *   /// <reference types="vertz/env" />
 */

interface ImportMetaHot {
  /** Accept the current module's HMR update. */
  accept(): void;
  /** Accept updates for specific dependencies. */
  accept(deps: string | string[], cb?: (modules: unknown[]) => void): void;
  /** Dispose callback — runs before module is replaced. */
  dispose(cb: (data: Record<string, unknown>) => void): void;
  /** Persistent data across HMR updates. */
  data: Record<string, unknown>;
}

interface ImportMeta {
  /** Whether this module is the entry point. Available in the vtz runtime. */
  readonly main: boolean;
  /** Hot Module Replacement API. Only available in dev mode; undefined in production. */
  readonly hot: ImportMetaHot | undefined;
}
