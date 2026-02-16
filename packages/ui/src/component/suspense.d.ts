/** Props for the Suspense component. */
export interface SuspenseProps {
  /** Function that returns the children to render (may throw a Promise). */
  children: () => Node;
  /** Fallback renderer shown while children are pending. */
  fallback: () => Node;
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
export declare function Suspense(props: SuspenseProps): Node;
//# sourceMappingURL=suspense.d.ts.map
