/**
 * Main test helper for Vertz UI components.
 *
 * `renderTest()` mounts a component into a lightweight DOM container
 * and returns query / interaction helpers scoped to that container.
 */
/** The result returned by `renderTest()`. */
export interface RenderTestResult {
  /** The container element that wraps the rendered component. */
  container: HTMLElement;
  /** Find an element by its text content. Throws if not found. */
  findByText: (text: string) => HTMLElement;
  /** Find an element by its text content. Returns null if not found. */
  queryByText: (text: string) => HTMLElement | null;
  /** Find an element by `data-testid`. Throws if not found. */
  findByTestId: (id: string) => HTMLElement;
  /** Find an element by `data-testid`. Returns null if not found. */
  queryByTestId: (id: string) => HTMLElement | null;
  /** Simulate a click on the given element. */
  click: (el: Element) => Promise<void>;
  /** Simulate typing text into an input element. */
  type: (el: Element, text: string) => Promise<void>;
  /** Remove the container from the DOM and clean up. */
  unmount: () => void;
}
/**
 * Render a component (Element or DocumentFragment) into a fresh container
 * attached to `document.body`.
 *
 * Returns scoped query and interaction helpers for the rendered tree.
 */
export declare function renderTest(component: Element | DocumentFragment): RenderTestResult;
//# sourceMappingURL=render-test.d.ts.map
