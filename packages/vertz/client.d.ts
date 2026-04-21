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
  }
}

export {};
