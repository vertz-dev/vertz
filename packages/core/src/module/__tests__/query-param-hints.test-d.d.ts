/**
 * Type-level tests for query parameter hints (Issue #180)
 *
 * When a route defines query params via schema, ctx.query should be typed.
 * When no query schema is provided, ctx.query should default to Record<string, string>
 * (standard URL search params) rather than `unknown`.
 */
export {};
//# sourceMappingURL=query-param-hints.test-d.d.ts.map
