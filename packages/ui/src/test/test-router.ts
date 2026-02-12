/**
 * Router testing helper for Vertz UI.
 *
 * Creates a router instance with given routes and an initial path,
 * returning the rendered component and navigation helpers.
 */

import type { RouteDefinitionMap } from '../router/define-routes';
import { defineRoutes } from '../router/define-routes';
import type { Router } from '../router/navigate';
import { createRouter } from '../router/navigate';

/** Options for `createTestRouter`. */
export interface TestRouterOptions {
  /** The initial URL path to navigate to (default "/"). */
  initialPath?: string;
}

/** Result returned by `createTestRouter`. */
export interface TestRouterResult {
  /** A container element that holds the route's rendered component. */
  component: Element;
  /** The underlying router instance. */
  router: Router;
  /** Navigate to a new path (wraps router.navigate). */
  navigate: (path: string) => Promise<void>;
}

/**
 * Create a test router with the given route definitions.
 *
 * The router is initialized at `initialPath` (default "/") and the
 * matched route's component is resolved and returned in `component`.
 *
 * @example
 * ```ts
 * const { component, router, navigate } = await createTestRouter({
 *   '/': { component: () => { const el = document.createElement('div'); el.textContent = 'Home'; return el; } },
 *   '/about': { component: () => { const el = document.createElement('div'); el.textContent = 'About'; return el; } },
 * });
 * ```
 */
export async function createTestRouter(
  routes: RouteDefinitionMap,
  opts?: TestRouterOptions,
): Promise<TestRouterResult> {
  const initialPath = opts?.initialPath ?? '/';

  // Push initial path into browser history so the router sees it.
  window.history.replaceState(null, '', initialPath);

  const compiled = defineRoutes(routes);
  const router = createRouter(compiled, initialPath);

  // Create a container to hold the current route's component.
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'test-router-container');

  // Resolve and render the initial route component.
  await renderCurrentRoute(router, container);

  async function navigate(path: string): Promise<void> {
    await router.navigate(path);
    await renderCurrentRoute(router, container);
  }

  return { component: container, navigate, router };
}

/**
 * Resolve the current route's component and replace the container contents.
 */
async function renderCurrentRoute(router: Router, container: HTMLElement): Promise<void> {
  // Clear previous content.
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  const match = router.current.value;
  if (!match) return;

  const componentResult = match.route.component();

  let node: Node;
  if (componentResult instanceof Promise) {
    const mod = await componentResult;
    node = (mod as { default: () => Node }).default();
  } else {
    node = componentResult;
  }

  container.appendChild(node);
}
