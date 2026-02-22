import { injectCSS } from './css/css';
import type { Theme } from './css/theme';
import { compileTheme } from './css/theme';
import { endHydration, startHydration } from './hydrate/hydration-context';

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
  /** Component registry for per-component hydration */
  // biome-ignore lint/suspicious/noExplicitAny: spec requires generic component functions
  registry?: Record<string, () => any>;
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

  if (mode === 'tolerant') {
    if (!root.firstChild) {
      // Dev warning: tolerant mode on empty root is likely a mistake
      if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
        console.warn(
          '[mount] hydration: "tolerant" used on empty root. ' +
            'Did you mean "replace"? Falling back to replace mode.',
        );
      }
      // Fall through to replace mode
    } else {
      try {
        startHydration(root);
        app();
        endHydration();
        options?.onMount?.(root);
        return {
          unmount: () => {
            root.textContent = '';
          },
          root,
        };
      } catch (e) {
        // Bail out: hydration failed, fall back to full CSR
        endHydration();
        if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
          console.warn('[mount] Hydration failed, falling back to replace mode:', e);
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
