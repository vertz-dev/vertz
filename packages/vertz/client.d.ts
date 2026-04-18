/**
 * Vertz client-side runtime type augmentations.
 *
 * Include in your tsconfig.json:
 *   "types": ["vertz/client"]
 *
 * Or add a triple-slash reference:
 *   /// <reference types="vertz/client" />
 */

declare global {
  interface ImportMetaHot {
    /** Accept the current module's HMR update. */
    accept(): void;
    /** Accept the current module's HMR update with a callback receiving the new module. */
    accept(cb: (newModule: unknown) => void): void;
    /** Accept updates for specific dependencies. */
    accept(deps: string | readonly string[], cb?: (modules: unknown[]) => void): void;
    /** Dispose callback — runs before module is replaced. */
    dispose(cb: (data: Record<string, unknown>) => void): void;
    /** Persistent data across HMR updates. */
    data: Record<string, unknown>;
  }

  interface ImportMeta {
    /** Hot Module Replacement API. Only available in dev mode; undefined in production and SSR. */
    readonly hot: ImportMetaHot | undefined;
  }
}

export {};
