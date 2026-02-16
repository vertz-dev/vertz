/**
 * Router testing helper for Vertz UI.
 *
 * Creates a router instance with given routes and an initial path,
 * returning the rendered component and navigation helpers.
 */
import { defineRoutes } from '../router/define-routes';
import { createRouter } from '../router/navigate';
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
export async function createTestRouter(routes, opts) {
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
  async function navigate(path) {
    await router.navigate(path);
    await renderCurrentRoute(router, container);
  }
  return { component: container, navigate, router };
}
/**
 * Resolve the current route's component and replace the container contents.
 */
async function renderCurrentRoute(router, container) {
  // Clear previous content.
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }
  const match = router.current.value;
  if (!match) return;
  const componentResult = match.route.component();
  let node;
  if (componentResult instanceof Promise) {
    const mod = await componentResult;
    node = mod.default();
  } else {
    node = componentResult;
  }
  container.appendChild(node);
}
//# sourceMappingURL=test-router.js.map
