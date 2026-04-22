/**
 * Vertz client-side runtime type augmentations.
 *
 * This file is the canonical source for the `ImportMeta.hot` augmentation.
 * `vertz/client` re-exports it via a triple-slash reference so the two
 * subpaths cannot drift.
 *
 * Include in your tsconfig.json:
 *   "types": ["@vertz/ui/client"]
 *
 * Or add a triple-slash reference:
 *   /// <reference types="@vertz/ui/client" />
 *
 * Apps that install the `vertz` meta-package can keep using `vertz/client`
 * — it resolves to the same augmentation.
 */

declare global {
  /** Event names emitted by the vtz HMR runtime. */
  type ImportMetaHotEvent =
    | 'vertz:beforeUpdate'
    | 'vertz:afterUpdate'
    | 'vertz:beforeFullReload'
    | 'vertz:invalidate'
    | 'vertz:error';

  /** Payload shape delivered to `hot.on()` listeners, per event. */
  interface ImportMetaHotEventPayloads {
    'vertz:beforeUpdate': { module: string };
    'vertz:afterUpdate': { module: string };
    'vertz:beforeFullReload': { reason?: string };
    'vertz:invalidate': { module: string; message?: string };
    'vertz:error': { module: string; error: unknown };
  }

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
    /**
     * Mark the current module as unable to apply an HMR update. Triggers a full
     * page reload with an optional explanatory message.
     */
    invalidate(message?: string): void;
    /**
     * Opt out of HMR for the current module. The next update targeting this
     * module falls back to a full page reload.
     */
    decline(): void;
    /** Subscribe to an HMR runtime event. */
    on<E extends ImportMetaHotEvent>(
      event: E,
      cb: (payload: ImportMetaHotEventPayloads[E]) => void,
    ): void;
    /** Remove a previously-registered listener. The callback must be the same reference. */
    off<E extends ImportMetaHotEvent>(
      event: E,
      cb: (payload: ImportMetaHotEventPayloads[E]) => void,
    ): void;
  }

  interface ImportMeta {
    /** Hot Module Replacement API. Only available in dev mode; undefined in production and SSR. */
    readonly hot: ImportMetaHot | undefined;
    /**
     * `true` when the current module is the entry point (`vtz <file>`, dev server entry,
     * or `vtz test` runner target). `false` when imported from another module.
     *
     * Use for "run if main" idioms — e.g. starting an HTTP server only when the file
     * is executed directly, not when imported by a test:
     *
     * ```ts
     * if (import.meta.main) app.listen(env.PORT);
     * ```
     *
     * Set natively by the vtz runtime on every module, so no polyfill is required.
     */
    readonly main: boolean;
  }
}

export {};
