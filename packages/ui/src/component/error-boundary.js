import { popErrorHandler, pushErrorHandler } from './error-boundary-context';

/**
 * Normalize a caught value into an Error instance.
 */
function toError(value) {
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
 *
 * Also registers an async error handler so that nested Suspense components
 * can propagate async errors to this boundary.
 */
export function ErrorBoundary(props) {
  /** Handle an async error from a nested Suspense by replacing the placeholder. */
  function handleAsyncError(error, placeholder) {
    const fallbackNode = props.fallback(error, retry);
    function retry() {
      try {
        const retryResult = props.children();
        if (fallbackNode.parentNode) {
          fallbackNode.parentNode.replaceChild(retryResult, fallbackNode);
        }
      } catch (_retryThrown) {
        // If children throw again on retry, keep the current fallback
      }
    }
    if (placeholder.parentNode) {
      placeholder.parentNode.replaceChild(fallbackNode, placeholder);
    }
  }
  try {
    pushErrorHandler(handleAsyncError);
    const result = props.children();
    popErrorHandler();
    return result;
  } catch (thrown) {
    popErrorHandler();
    const error = toError(thrown);
    const fallbackNode = props.fallback(error, retry);
    function retry() {
      try {
        const retryResult = props.children();
        if (fallbackNode.parentNode) {
          fallbackNode.parentNode.replaceChild(retryResult, fallbackNode);
        }
      } catch (_retryThrown) {
        // If children throw again on retry, keep the current fallback
      }
    }
    return fallbackNode;
  }
}
//# sourceMappingURL=error-boundary.js.map
