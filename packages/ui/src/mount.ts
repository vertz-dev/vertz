import { injectCSS } from './css/css';
import type { Theme } from './css/theme';
import { compileTheme } from './css/theme';
import { endHydration, startHydration } from './hydrate/hydration-context';
import { popScope, pushScope, runCleanups } from './runtime/disposal';

/**
 * Options for mounting an app to the DOM.
 */
export interface MountOptions {
  /** Theme definition for CSS vars */
  theme?: Theme;
  /** Global CSS strings to inject */
  styles?: string[];
  /** Hydration mode: 'replace' (default), 'tolerant' (walk SSR DOM), or 'strict' (reserved) */
  hydration?: 'replace' | 'tolerant' | 'strict';
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
 * Mount an app to a DOM element.
 *
 * For full-app SSR hydration, use `{ hydration: 'tolerant' }` to walk
 * existing SSR DOM and attach reactivity without clearing and re-rendering.
 * For island/per-component hydration, use `hydrate()` instead.
 *
 * @param app - App function that returns an HTMLElement
 * @param selector - CSS selector string or HTMLElement
 * @param options - Mount options (theme, styles, onMount, etc.)
 * @returns MountHandle with unmount function and root element
 */
export function mount<AppFn extends () => HTMLElement>(
  app: AppFn,
  selector: string | HTMLElement,
  options?: MountOptions,
): MountHandle {
  // Validate selector type
  if (typeof selector !== 'string' && !(selector instanceof HTMLElement)) {
    throw new Error(`mount(): selector must be a string or HTMLElement, got ${typeof selector}`);
  }

  // Resolve root element
  const root: HTMLElement =
    typeof selector === 'string' ? (document.querySelector(selector) as HTMLElement) : selector;

  if (!root) {
    throw new Error(`mount(): root element "${selector}" not found`);
  }

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

  const mode = options?.hydration ?? 'replace';

  if (mode === 'strict') {
    throw new Error(
      "mount(): hydration: 'strict' is reserved but not yet implemented. " +
        "Use 'tolerant' for SSR hydration or 'replace' (default) for CSR.",
    );
  }

  if (mode === 'tolerant') {
    if (!root.firstChild) {
      // Dev warning: tolerant mode on empty root is likely a mistake
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn(
          '[mount] hydration: "tolerant" has no effect on an empty root ' +
            '(no SSR content found). Using replace mode.',
        );
      }
      // Fall through to replace mode
    } else {
      const scope = pushScope();
      try {
        startHydration(root);
        app();
        endHydration();
        popScope();
        options?.onMount?.(root);
        return {
          unmount: () => {
            runCleanups(scope);
            root.textContent = '';
          },
          root,
        };
      } catch (e) {
        // Bail out: hydration failed, fall back to full CSR
        endHydration();
        popScope();
        runCleanups(scope);
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.warn('[mount] Hydration failed — re-rendering from scratch (no data loss):', e);
        }
        // Fall through to replace mode
      }
    }
  }

  // Replace mode (default, or fallback from failed tolerant)
  root.textContent = '';
  const appElement = app();
  root.appendChild(appElement);

  // Call onMount callback
  options?.onMount?.(root);

  return {
    unmount: () => {
      root.textContent = '';
    },
    root,
  };
}
