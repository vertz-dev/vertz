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

// ─── PathWithParams ─────────────────────────────────────────────────────────

/**
 * Convert a route pattern to the union of URL shapes it accepts.
 * - Static: `'/'` → `'/'`
 * - Param: `'/tasks/:id'` → `` `/tasks/${string}` ``
 * - Wildcard: `'/files/*'` → `` `/files/${string}` ``
 * - Multi: `'/users/:id/posts/:postId'` → `` `/users/${string}/posts/${string}` ``
 * - Fallback: `string` → `string` (backward compat)
 */
export type PathWithParams<T extends string> = T extends `${infer Before}*`
  ? `${PathWithParams<Before>}${string}`
  : T extends `${infer Before}:${string}/${infer After}`
    ? `${Before}${string}/${PathWithParams<`${After}`>}`
    : T extends `${infer Before}:${string}`
      ? `${Before}${string}`
      : T;

/**
 * Join parent and child route path segments.
 * - `JoinPaths<'/', '/brands'>` → `'/brands'`
 * - `JoinPaths<'/admin', '/settings'>` → `'/admin/settings'`
 * - `JoinPaths<'', '/brands'>` → `'/brands'`
 */
export type JoinPaths<Parent extends string, Child extends string> = Parent extends '' | '/'
  ? Child
  : Child extends '/'
    ? Parent
    : `${Parent}${Child}`;

/**
 * Union of all route pattern keys from a route map, including nested children.
 * Recursively walks `children` and concatenates parent + child paths.
 * Short-circuits to `string` for index signatures (backward compat).
 */
export type RoutePattern<
  TRouteMap extends Record<string, unknown>,
  _Prefix extends string = '',
> = string extends keyof TRouteMap
  ? string
  : {
      [K in keyof TRouteMap & string]:
        | JoinPaths<_Prefix, K>
        | (TRouteMap[K] extends { children: infer C extends Record<string, unknown> }
            ? RoutePattern<C, JoinPaths<_Prefix, K>>
            : never);
    }[keyof TRouteMap & string];

// ─── RoutePaths ─────────────────────────────────────────────────────────────

/**
 * Union of all valid URL shapes for a route map.
 * Maps each route pattern key through `PathWithParams` to produce the accepted URL shapes.
 *
 * Example:
 * ```
 * RoutePaths<{ '/': ..., '/tasks/:id': ... }> = '/' | `/tasks/${string}`
 * ```
 */
export type RoutePaths<TRouteMap extends Record<string, unknown>> = {
  [K in RoutePattern<TRouteMap>]: PathWithParams<K>;
}[RoutePattern<TRouteMap>];
