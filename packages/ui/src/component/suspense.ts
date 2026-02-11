/** Props for the Suspense component. */
export interface SuspenseProps {
  /** Function that returns the children to render (may throw a Promise). */
  children: () => Node;
  /** Fallback renderer shown while children are pending. */
  fallback: () => Node;
}

/**
 * Check if a value is a thenable (Promise-like).
 */
function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    typeof (value as Promise<unknown>).then === 'function'
  );
}

/**
 * Suspense component for async boundaries.
 * Renders children synchronously if possible.
 * If children throw a Promise, renders the fallback and waits for resolution,
 * then replaces the fallback with the children result.
 * If children throw a non-Promise error, renders the fallback.
 */
export function Suspense(props: SuspenseProps): Node {
  try {
    return props.children();
  } catch (thrown: unknown) {
    if (isPromise(thrown)) {
      // Create a placeholder that will be replaced after the promise resolves
      const placeholder = props.fallback();

      thrown.then(() => {
        try {
          const resolved = props.children();
          // Replace placeholder in the DOM if it has a parent
          if (placeholder.parentNode) {
            placeholder.parentNode.replaceChild(resolved, placeholder);
          }
        } catch (_retryError: unknown) {
          // If children throw again on retry, keep the fallback
        }
      });

      return placeholder;
    }

    // Non-Promise error: show fallback
    return props.fallback();
  }
}
