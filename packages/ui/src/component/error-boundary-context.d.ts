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
/** An error handler that replaces a placeholder node with an error fallback. */
export type AsyncErrorHandler = (error: Error, placeholder: Node) => void;
/**
 * Push an error handler onto the stack.
 * Called by ErrorBoundary before invoking children().
 */
export declare function pushErrorHandler(handler: AsyncErrorHandler): void;
/**
 * Pop the most recent error handler from the stack.
 * Called by ErrorBoundary after children() completes.
 */
export declare function popErrorHandler(): void;
/**
 * Get the current (nearest) error handler, if any.
 * Called by Suspense at creation time to capture the handler reference.
 */
export declare function getCurrentErrorHandler(): AsyncErrorHandler | undefined;
//# sourceMappingURL=error-boundary-context.d.ts.map
