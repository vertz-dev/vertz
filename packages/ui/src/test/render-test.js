/**
 * Main test helper for Vertz UI components.
 *
 * `renderTest()` mounts a component into a lightweight DOM container
 * and returns query / interaction helpers scoped to that container.
 */
import { click as clickInteraction, type as typeInteraction } from './interactions';
import { findByTestId, findByText, queryByTestId, queryByText } from './queries';
/**
 * Render a component (Element or DocumentFragment) into a fresh container
 * attached to `document.body`.
 *
 * Returns scoped query and interaction helpers for the rendered tree.
 */
export function renderTest(component) {
  const container = document.createElement('div');
  container.setAttribute('data-testid', 'render-test-container');
  container.appendChild(component);
  document.body.appendChild(container);
  return {
    click: clickInteraction,
    container,
    findByTestId: (id) => findByTestId(container, id),
    findByText: (text) => findByText(container, text),
    queryByTestId: (id) => queryByTestId(container, id),
    queryByText: (text) => queryByText(container, text),
    type: typeInteraction,
    unmount() {
      container.remove();
    },
  };
}
//# sourceMappingURL=render-test.js.map
