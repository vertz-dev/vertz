/**
 * Normalizes the API prefix string.
 *
 * - `undefined` → `'/api'` (default)
 * - Strips trailing slashes
 * - Adds leading slash if missing (and non-empty)
 * - `'/'` → `''`
 * - `''` → `''`
 */
export function normalizeApiPrefix(raw: string | undefined): string {
  if (raw === undefined) return '/api';
  if (raw === '') return '';

  // Strip trailing slashes
  let result = raw.replace(/\/+$/, '');

  // After stripping, if empty → was just slashes (e.g. '/')
  if (result === '') return '';

  // Add leading slash if missing
  if (!result.startsWith('/')) {
    result = `/${result}`;
  }

  return result;
}
