/**
 * Loader execution for matched routes.
 * Runs all loaders in the matched chain in parallel using Promise.all.
 */

import type { MatchedRoute } from './define-routes';

/**
 * Execute all loaders for matched routes in parallel.
 *
 * Each loader receives `{ params }` with the full merged params from all matched routes.
 * Routes without loaders produce `undefined` in the results array.
 *
 * @param matched - The chain of matched routes (parent to leaf)
 * @param params - Merged params from all matched routes
 * @returns Array of loader results (one per matched route)
 */
export async function executeLoaders(
  matched: MatchedRoute[],
  params: Record<string, string>,
): Promise<unknown[]> {
  const promises = matched.map((m) => {
    if (!m.route.loader) return Promise.resolve(undefined);
    return Promise.resolve(m.route.loader({ params } as never));
  });

  return Promise.all(promises);
}
