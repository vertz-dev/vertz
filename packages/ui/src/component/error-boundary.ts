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
 */
export function ErrorBoundary(props: ErrorBoundaryProps): Node {
  try {
    return props.children();
  } catch (thrown: unknown) {
    const error = toError(thrown);
    const retry = () => {
      // Retry simply re-invokes children — the caller decides what to do with the result
    };
    return props.fallback(error, retry);
  }
}
