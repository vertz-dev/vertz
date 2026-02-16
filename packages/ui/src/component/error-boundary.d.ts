/** Props for the ErrorBoundary component. */
export interface ErrorBoundaryProps {
  /** Function that returns the children to render. */
  children: () => Node;
  /** Fallback renderer that receives the caught error and a retry function. */
  fallback: (error: Error, retry: () => void) => Node;
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
export declare function ErrorBoundary(props: ErrorBoundaryProps): Node;
//# sourceMappingURL=error-boundary.d.ts.map
