/**
 * Template literal type utility that extracts route parameter names from a path pattern.
 *
 * Examples:
 * - `'/users/:id'` -> `{ id: string }`
 * - `'/users/:id/posts/:postId'` -> `{ id: string; postId: string }`
 * - `'/files/*'` -> `{ '*': string }`
 * - `'/users'` -> `Record<string, never>`
 */

/** Extract param names from a single segment. */
type ExtractSegmentParam<S extends string> = S extends `:${infer Param}` ? Param : never;

/** Recursively extract params from path segments separated by '/'. */
type ExtractParamsFromSegments<T extends string> = T extends `${infer Segment}/${infer Rest}`
  ? ExtractSegmentParam<Segment> | ExtractParamsFromSegments<Rest>
  : ExtractSegmentParam<T>;

/** Check if a path contains a wildcard '*' at the end. */
type HasWildcard<T extends string> = T extends `${string}*` ? true : false;

/** Remove trailing wildcard for param extraction. */
type WithoutWildcard<T extends string> = T extends `${infer Before}*` ? Before : T;

/**
 * Extract typed params from a route path pattern.
 * `:param` segments become `{ param: string }`.
 * A trailing `*` becomes `{ '*': string }`.
 */
export type ExtractParams<T extends string> = [
  ExtractParamsFromSegments<WithoutWildcard<T>>,
] extends [never]
  ? HasWildcard<T> extends true
    ? { '*': string }
    : Record<string, never>
  : HasWildcard<T> extends true
    ? { [K in ExtractParamsFromSegments<WithoutWildcard<T>>]: string } & { '*': string }
    : { [K in ExtractParamsFromSegments<WithoutWildcard<T>>]: string };
