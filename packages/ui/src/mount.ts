import { injectCSS } from './css/css';
import type { Theme } from './css/theme';
import { compileTheme } from './css/theme';

/**
 * Options for mounting an app to the DOM.
 */
export interface MountOptions {
  /** Theme definition for CSS vars */
  theme?: Theme;
  /** Global CSS strings to inject */
  styles?: string[];
  /** Hydration mode: 'replace' (default), 'tolerant', or false (no hydration) */
  hydration?: 'replace' | 'tolerant' | false;
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

  // Handle hydration mode
  const hydrationMode = options?.hydration ?? 'replace';

  if (hydrationMode === 'replace') {
    // Clear existing content (replace mode - default)
    root.textContent = '';
  } else if (hydrationMode === 'tolerant') {
    // Tolerant mode: Walk existing DOM nodes from SSR and try to preserve them.
    // The app function receives the root element and can choose to reuse
    // existing DOM nodes instead of creating new ones.
    // This allows SSR-rendered content to remain while hydration attaches event handlers.
  }
  // false = no hydration, just leave existing content as-is

  // Create and append the app
  // In tolerant mode, app receives the root so it can walk existing DOM
  const appElement = hydrationMode === 'tolerant' ? app() : app();

  // Only append if not using tolerant mode (app handles its own DOM in that case)
  if (hydrationMode !== 'tolerant') {
    root.appendChild(appElement);
  } else if (appElement !== root && root.childNodes.length === 0) {
    // If app returned a different element and root is empty, append it
    root.appendChild(appElement);
  }

  // Call onMount callback
  options?.onMount?.(root);

  return {
    unmount: () => {
      root.textContent = '';
    },
    root,
  };
}
