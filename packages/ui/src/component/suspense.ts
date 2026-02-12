import { type AsyncErrorHandler, getCurrentErrorHandler } from './error-boundary-context';

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
 * Normalize a caught value into an Error instance.
 */
function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

/**
 * Propagate an error to the nearest ErrorBoundary, or surface it globally
 * if no ErrorBoundary is present.
 */
function propagateError(
  error: Error,
  placeholder: Node,
  errorHandler: AsyncErrorHandler | undefined,
): void {
  if (errorHandler) {
    errorHandler(error, placeholder);
  } else {
    queueMicrotask(() => {
      throw error;
    });
  }
}

/**
 * Suspense component for async boundaries.
 * Renders children synchronously if possible.
 * If children throw a Promise, renders the fallback and waits for resolution,
 * then replaces the fallback with the children result.
 * If children throw a non-Promise error, it is re-thrown (use ErrorBoundary for error handling).
 *
 * For async errors (promise rejection or retry failure), the error is propagated
 * to the nearest ErrorBoundary. If no ErrorBoundary exists, the error is surfaced
 * globally via queueMicrotask to avoid silent swallowing.
 */
export function Suspense(props: SuspenseProps): Node {
  // Capture the nearest ErrorBoundary's handler at creation time
  const errorHandler = getCurrentErrorHandler();

  try {
    return props.children();
  } catch (thrown: unknown) {
    if (!isPromise(thrown)) {
      // Non-Promise errors are not Suspense's concern — re-throw for ErrorBoundary
      throw thrown;
    }

    // Create a placeholder that will be replaced after the promise resolves
    const placeholder = props.fallback();

    thrown
      .then(() => {
        try {
          const resolved = props.children();
          // Replace placeholder in the DOM if it has a parent
          if (placeholder.parentNode) {
            placeholder.parentNode.replaceChild(resolved, placeholder);
          }
        } catch (retryError: unknown) {
          if (!isPromise(retryError)) {
            // Non-Promise retry errors propagate to ErrorBoundary
            propagateError(toError(retryError), placeholder, errorHandler);
          }
          // If children re-suspend (throw another Promise), keep the fallback
        }
      })
      .catch((error: unknown) => {
        propagateError(toError(error), placeholder, errorHandler);
      });

    return placeholder;
  }
}
