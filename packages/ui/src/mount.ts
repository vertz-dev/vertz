import {
  beginDeferringMounts,
  discardDeferredMounts,
  flushDeferredMounts,
} from './component/lifecycle';
import { injectCSS } from './css/css';
import type { Theme } from './css/theme';
import { compileTheme } from './css/theme';
import { discardDeferredEffects, endHydration, startHydration } from './hydrate/hydration-context';
import { popScope, pushScope, runCleanups } from './runtime/disposal';

/**
 * Tracks which root elements have been mounted.
 *
 * Uses globalThis so the map survives Bun's HMR module re-evaluation.
 * Bun bundles all modules into a single chunk and re-evaluates them all
 * immediately after initial load (HMR init). Without globalThis, the
 * WeakMap would be recreated empty on each re-evaluation, defeating the guard.
 *
 * Same persistence pattern as the Fast Refresh registry.
 */
const MOUNTED_KEY = Symbol.for('vertz:mounted-roots');
const _global = globalThis as Record<symbol, WeakMap<HTMLElement, MountHandle>>;
if (!_global[MOUNTED_KEY]) _global[MOUNTED_KEY] = new WeakMap();
const mountedRoots: WeakMap<HTMLElement, MountHandle> = _global[MOUNTED_KEY];

/**
 * Options for mounting an app to the DOM.
 */
export interface MountOptions {
  /** Theme definition for CSS vars */
  theme?: Theme;
  /** Global CSS strings to inject */
  styles?: string[];
  /** Callback after mount completes */
  onMount?: (root: HTMLElement) => void;
}

/**
 * Handle returned from mount() for controlling the mounted app.
 */
export interface MountHandle {
  /** Unmount the app and cleanup */
  unmount: () => void;
  /** Root HTMLElement */
  root: HTMLElement;
}

/**
 * Mount an app to the `#app` root element.
 *
 * Uses tolerant hydration automatically: if the root element has SSR content,
 * it walks the existing DOM and attaches reactivity without re-creating nodes.
 * If the root is empty (CSR), it renders from scratch.
 *
 * @param app - App function that returns an HTMLElement
 * @param options - Mount options (theme, styles, onMount, etc.)
 * @returns MountHandle with unmount function and root element
 */
export function mount<AppFn extends () => Element | DocumentFragment>(
  app: AppFn,
  options?: MountOptions,
): MountHandle {
  const root = document.getElementById('app');

  if (!root) {
    throw new Error('mount(): root element "#app" not found');
  }

  // HMR guard: if this root was already mounted, return existing handle.
  // Bun's HMR runtime re-evaluates all modules after initial load,
  // which re-runs mount(). Without this guard, duplicate component instances
  // cause the first HMR save to lose signal state.
  const existingHandle = mountedRoots.get(root);
  if (existingHandle) return existingHandle;

  // Inject theme CSS
  if (options?.theme) {
    const { css } = compileTheme(options.theme);
    injectCSS(css);
  }

  // Inject global styles
  if (options?.styles) {
    for (const css of options.styles) {
      injectCSS(css);
    }
  }

  // Tolerant hydration: if the root has SSR content, walk and adopt it
  if (root.firstChild) {
    const scope = pushScope();
    let hydrationOk = false;
    try {
      beginDeferringMounts();
      startHydration(root);
      app();
      endHydration();
      hydrationOk = true;
    } catch (e) {
      // Bail out: hydration failed, fall back to full CSR.
      // Discard deferred mounts (don't run them) and deferred effects
      // (they reference DOM nodes from the broken hydration tree).
      discardDeferredMounts();
      discardDeferredEffects();
      endHydration();
      popScope();
      runCleanups(scope);
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn('[mount] Hydration failed — re-rendering from scratch (no data loss):', e);
      }
      // Fall through to CSR render
    }

    if (hydrationOk) {
      // Flush deferred onMount callbacks AFTER hydration ends but BEFORE
      // popScope() — so cleanup functions register in the mount scope.
      // Kept outside the hydration try/catch: if an onMount throws, it must
      // NOT trigger CSR fallback (hydration already succeeded, DOM is intact).
      flushDeferredMounts();
      popScope();
      options?.onMount?.(root);
      const handle: MountHandle = {
        unmount: () => {
          mountedRoots.delete(root);
          runCleanups(scope);
          root.textContent = '';
        },
        root,
      };
      mountedRoots.set(root, handle);
      return handle;
    }
  }

  // CSR render (empty root, or fallback from failed hydration)
  const scope = pushScope();
  root.textContent = '';
  const appElement = app();
  root.appendChild(appElement);
  popScope();

  options?.onMount?.(root);

  const handle: MountHandle = {
    unmount: () => {
      mountedRoots.delete(root);
      runCleanups(scope);
      root.textContent = '';
    },
    root,
  };
  mountedRoots.set(root, handle);
  return handle;
}
