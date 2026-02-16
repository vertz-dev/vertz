/**
 * Internal error boundary context.
 *
 * Provides a stack-based mechanism for Suspense to find the nearest
 * ErrorBoundary's error handler at creation time. The captured handler
 * is used later in async callbacks to propagate errors to ErrorBoundary
 * instead of swallowing them.
 *
 * @internal — not part of the public API
 */
const handlerStack = [];
/**
 * Push an error handler onto the stack.
 * Called by ErrorBoundary before invoking children().
 */
export function pushErrorHandler(handler) {
  handlerStack.push(handler);
}
/**
 * Pop the most recent error handler from the stack.
 * Called by ErrorBoundary after children() completes.
 */
export function popErrorHandler() {
  handlerStack.pop();
}
/**
 * Get the current (nearest) error handler, if any.
 * Called by Suspense at creation time to capture the handler reference.
 */
export function getCurrentErrorHandler() {
  if (handlerStack.length === 0) {
    return undefined;
  }
  return handlerStack[handlerStack.length - 1];
}
//# sourceMappingURL=error-boundary-context.js.map
