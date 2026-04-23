/** DOM element types accepted by JSX (mirrors JSX.Element). */
type JsxElement = HTMLElement | SVGElement | DocumentFragment;

/** Props for the ErrorBoundary component. */
export interface ErrorBoundaryProps {
  /** Function that returns the children to render. */
  children: () => JsxElement;
  /** Fallback renderer that receives the caught error and a retry function. */
  fallback: (error: Error, retry: () => void) => JsxElement;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  return new Error(String(value));
}

/**
 * Catches synchronous errors thrown by `children()` and renders `fallback` instead.
 * The fallback receives the error and a retry function; calling retry re-invokes
 * children() and, if it succeeds, swaps the fallback node with the new result.
 */
export function ErrorBoundary(props: ErrorBoundaryProps): JsxElement {
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
