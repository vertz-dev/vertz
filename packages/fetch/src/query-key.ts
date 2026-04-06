export interface QueryKeyInput {
  path: string;
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
}

/**
 * Build a cache key array from a path template, params, and optional query.
 *
 * Designed for use with TanStack Query, SWR, or any cache library that uses
 * array-based hierarchical keys. For Vertz's internal cache, use
 * `QueryDescriptor._key` instead.
 *
 * The path template is split on `{param}` placeholders. Static segments and
 * resolved param values alternate in the output. When a param value is
 * `undefined` or `null`, the key is truncated at that point — the static
 * segment preceding the param is kept, but the nullish value and everything
 * after it are omitted.
 *
 * @example
 * ```ts
 * queryKey({ path: '/tasks/{taskId}', params: { taskId: 'abc' } })
 * // => ['/tasks', 'abc']
 *
 * queryKey({ path: '/tasks', query: { status: 'active' } })
 * // => ['/tasks', { status: 'active' }]
 *
 * queryKey({ path: '/tasks/{taskId}', params: { taskId: undefined } })
 * // => ['/tasks']
 * ```
 */
export function queryKey(input: QueryKeyInput): readonly unknown[] {
  const { path, params, query } = input;

  if (!path) return [];

  // Split path on {param} placeholders.
  // Even indices are static segments, odd indices are param names.
  const segments = path.split(/\{([^}]+)\}/);
  const parts: unknown[] = [];
  let stopped = false;

  for (let i = 0; i < segments.length; i++) {
    if (i % 2 === 0) {
      // Static segment — strip trailing slash and include if non-empty
      const segment = segments[i].replace(/\/$/, '');
      if (segment) {
        parts.push(segment);
      }
    } else {
      // Param name — resolve from params, stop on nullish
      const value = params?.[segments[i]];
      if (value === undefined || value === null) {
        stopped = true;
        break;
      }
      parts.push(value);
    }
  }

  // Append query object only if we didn't stop early due to nullish param
  if (!stopped && query !== undefined && query !== null && parts.length > 0) {
    parts.push(query);
  }

  return Object.freeze(parts);
}
