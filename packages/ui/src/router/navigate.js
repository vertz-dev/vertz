/**
 * Router navigation API.
 *
 * Creates a router instance with reactive current route state,
 * navigation, and revalidation.
 */
import { signal } from '../runtime/signal';
import { matchRoute } from './define-routes';
import { executeLoaders } from './loader';
/**
 * Create a router instance.
 *
 * @param routes - Compiled route list from defineRoutes()
 * @param initialUrl - The initial URL to match (optional; auto-detects from window.location or __SSR_URL__)
 * @returns Router instance with reactive state and navigation methods
 */
export function createRouter(routes, initialUrl) {
  // Auto-detect SSR context
  const isSSR = typeof window === 'undefined' || typeof globalThis.__SSR_URL__ !== 'undefined';
  // Determine the initial URL
  let url;
  if (initialUrl) {
    url = initialUrl;
  } else if (isSSR) {
    // In SSR, use the __SSR_URL__ global set by the SSR entry
    url = globalThis.__SSR_URL__ || '/';
  } else {
    // In browser, use window.location
    url = window.location.pathname + window.location.search;
  }
  const initialMatch = matchRoute(routes, url);
  const current = signal(initialMatch);
  const loaderData = signal([]);
  const loaderError = signal(null);
  const searchParams = signal(initialMatch?.search ?? {});
  /** Navigation generation counter for stale-loader detection. */
  let navigationGen = 0;
  /** AbortController for the current in-flight navigation. */
  let currentAbort = null;
  // Run initial loaders
  if (initialMatch) {
    const gen = ++navigationGen;
    const abort = new AbortController();
    currentAbort = abort;
    runLoaders(initialMatch, gen, abort.signal).catch(() => {
      // Error is stored in loaderError signal
    });
  }
  async function runLoaders(match, gen, abortSignal) {
    try {
      loaderError.value = null;
      const results = await executeLoaders(match.matched, match.params, abortSignal);
      // Only apply if this is still the current navigation
      if (gen === navigationGen) {
        loaderData.value = results;
      }
    } catch (err) {
      if (gen === navigationGen) {
        loaderError.value = err instanceof Error ? err : new Error(String(err));
      }
    }
  }
  async function applyNavigation(url) {
    // Abort any in-flight navigation
    if (currentAbort) {
      currentAbort.abort();
    }
    const gen = ++navigationGen;
    const abort = new AbortController();
    currentAbort = abort;
    const match = matchRoute(routes, url);
    current.value = match;
    if (match) {
      searchParams.value = match.search;
      await runLoaders(match, gen, abort.signal);
    } else {
      searchParams.value = {};
      if (gen === navigationGen) {
        loaderData.value = [];
        loaderError.value = null;
      }
    }
  }
  async function navigate(url, options) {
    // Update browser history (skip in SSR)
    if (!isSSR) {
      if (options?.replace) {
        window.history.replaceState(null, '', url);
      } else {
        window.history.pushState(null, '', url);
      }
    }
    await applyNavigation(url);
  }
  async function revalidate() {
    const match = current.value;
    if (match) {
      // Abort any in-flight navigation
      if (currentAbort) {
        currentAbort.abort();
      }
      const gen = ++navigationGen;
      const abort = new AbortController();
      currentAbort = abort;
      await runLoaders(match, gen, abort.signal);
    }
  }
  // Listen for popstate (back/forward browser buttons) — skip in SSR
  let onPopState = null;
  if (!isSSR) {
    onPopState = () => {
      const url = window.location.pathname + window.location.search;
      applyNavigation(url).catch(() => {
        // Error is stored in loaderError signal
      });
    };
    window.addEventListener('popstate', onPopState);
  }
  function dispose() {
    if (onPopState) {
      window.removeEventListener('popstate', onPopState);
    }
    if (currentAbort) {
      currentAbort.abort();
    }
  }
  return {
    current,
    dispose,
    loaderData,
    loaderError,
    navigate,
    revalidate,
    searchParams,
  };
}
//# sourceMappingURL=navigate.js.map
