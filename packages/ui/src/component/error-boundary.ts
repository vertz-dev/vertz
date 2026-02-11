/** Props for the ErrorBoundary component. */
export interface ErrorBoundaryProps {
  /** Function that returns the children to render. */
  children: () => Node;
  /** Fallback renderer that receives the caught error and a retry function. */
  fallback: (error: Error, retry: () => void) => Node;
}

/**
 * Normalize a caught value into an Error instance.
 */
function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

/**
 * ErrorBoundary component.
 * Catches errors thrown by `children()` and renders `fallback` instead.
 * The fallback receives the error and a retry function to re-attempt rendering.
 *
 * When retry is called, children() is re-invoked. If it succeeds, the fallback
 * node in the DOM is replaced with the new children result.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): Node {
  try {
    return props.children();
  } catch (thrown: unknown) {
    const error = toError(thrown);
    const fallbackNode = props.fallback(error, retry);

    function retry(): void {
      try {
        const retryResult = props.children();
        if (fallbackNode.parentNode) {
          fallbackNode.parentNode.replaceChild(retryResult, fallbackNode);
        }
      } catch (_retryThrown: unknown) {
        // If children throw again on retry, keep the current fallback
      }
    }

    return fallbackNode;
  }
}
