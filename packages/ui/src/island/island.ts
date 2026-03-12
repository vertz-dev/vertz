/**
 * Island component — creates a hydration boundary for interactive components.
 *
 * On the server: renders the component inside a wrapper div with
 * `data-v-island` marker and serialized props for client-side hydration.
 *
 * On the client (full-hydration mode): renders the component normally.
 * The `data-v-island` marker is inert — hydration happens via `data-v-id`.
 *
 * On the client (island mode): not called directly. `hydrateIslands()` handles
 * hydration from the SSR-rendered DOM using the island markers.
 */

export interface IslandProps {
  /** Unique identifier matching the client-side registry key */
  id: string;
  /** The component function to render */
  component: (props: Record<string, unknown>) => unknown;
  /** Props to pass to the component (must be JSON-serializable) */
  props?: Record<string, unknown>;
}

/**
 * Validate that all props are JSON-serializable.
 * Throws a clear error if a prop value is a function, Symbol, etc.
 */
function validateSerializable(props: Record<string, unknown>, islandId: string): void {
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') {
      throw new Error(
        `[vertz] Island "${islandId}" received a function prop "${key}". ` +
          'Island props must be JSON-serializable. Define event handlers inside the island component instead.',
      );
    }
    if (typeof value === 'symbol') {
      throw new Error(
        `[vertz] Island "${islandId}" received a Symbol prop "${key}". ` +
          'Island props must be JSON-serializable.',
      );
    }
  }
}

export function Island({ id, component: Component, props = {} }: IslandProps): HTMLDivElement {
  validateSerializable(props, id);

  // Create wrapper with island marker
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-v-island', id);

  // Create script tag with serialized props
  const script = document.createElement('script');
  script.setAttribute('data-v-island-props', '');
  script.setAttribute('type', 'application/json');
  script.textContent = JSON.stringify(props);
  wrapper.appendChild(script);

  // Render the component and append its output
  const content = Component(props);
  if (content != null) {
    if (content instanceof Node) {
      wrapper.appendChild(content);
    } else if (typeof content === 'string') {
      wrapper.appendChild(document.createTextNode(content));
    }
  }

  return wrapper;
}
