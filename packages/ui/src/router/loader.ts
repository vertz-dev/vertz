/**
 * Loader execution for matched routes.
 * Runs all loaders in the matched chain in parallel using Promise.all.
 */

import type { MatchedRoute } from './define-routes';

/**
 * Execute all loaders for matched routes in parallel.
 *
 * Each loader receives `{ params, signal }` with the full merged params
 * from all matched routes and an AbortSignal for cancellation.
 * Routes without loaders produce `undefined` in the results array.
 *
 * @param matched - The chain of matched routes (parent to leaf)
 * @param params - Merged params from all matched routes
 * @param signal - AbortSignal to pass to loaders for cancellation
 * @returns Array of loader results (one per matched route)
 */
export async function executeLoaders(
  matched: MatchedRoute[],
  params: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown[]> {
  const loaderSignal = signal ?? new AbortController().signal;
  const promises = matched.map((m) => {
    if (!m.route.loader) return Promise.resolve(undefined);
    return Promise.resolve(m.route.loader({ params, signal: loaderSignal }));
  });

  return Promise.all(promises);
}
