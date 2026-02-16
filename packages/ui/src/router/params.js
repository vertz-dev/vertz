/**
 * Template literal type utility that extracts route parameter names from a path pattern.
 *
 * Examples:
 * - `'/users/:id'` -> `{ id: string }`
 * - `'/users/:id/posts/:postId'` -> `{ id: string; postId: string }`
 * - `'/files/*'` -> `{ '*': string }`
 * - `'/users'` -> `Record<string, never>`
 */
export {};
//# sourceMappingURL=params.js.map
