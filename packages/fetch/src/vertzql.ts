/** Shape of a single include entry for VertzQL client params. */
export interface VertzQLIncludeEntry {
  select?: Record<string, true>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  include?: Record<string, true | VertzQLIncludeEntry>;
}

export interface VertzQLParams {
  [key: string]: unknown;
  select?: Record<string, true>;
  include?: Record<string, true | VertzQLIncludeEntry>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
}

/**
 * Encodes VertzQL parameters into a base64url string
 * suitable for the `q=` query parameter.
 *
 * This is the client-side counterpart to `parseVertzQL` on the server.
 */
export function encodeVertzQL(params: VertzQLParams): string {
  const json = JSON.stringify(params);
  const b64 = btoa(json);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Keys that belong inside the encoded `q` parameter (structural, not human-readable). */
const ENCODED_KEYS = new Set(['select', 'include']);

/**
 * Flattens a `where` object into bracket-notation query keys.
 *
 * - `{ field: value }`          → `{ 'where[field]': String(value) }`
 * - `{ field: { op: value } }`  → `{ 'where[field][op]': String(value) }`
 */
function flattenWhere(where: Record<string, unknown>, target: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
        if (opValue !== undefined && opValue !== null) {
          target[`where[${field}][${op}]`] = String(opValue);
        }
      }
    } else {
      target[`where[${field}]`] = String(value);
    }
  }
}

/**
 * Flattens an `orderBy` object into `field:dir` colon format.
 *
 * - `{ createdAt: 'desc' }` → `'createdAt:desc'`
 */
function flattenOrderBy(orderBy: Record<string, 'asc' | 'desc'>): string {
  return Object.entries(orderBy)
    .map(([field, dir]) => `${field}:${dir}`)
    .join(',');
}

/**
 * Extracts structural VertzQL keys (`select`, `include`) from a query object,
 * encodes them as a base64url `q` parameter, and flattens `where`, `orderBy`,
 * and `limit` into URL-native query parameter format.
 *
 * - `select` / `include` → encoded in `q` (complex nested structures)
 * - `where`              → bracket notation: `where[field]=value`
 * - `orderBy`            → colon format: `orderBy=field:dir`
 * - `limit`              → flat number: `limit=N`
 *
 * Returns `undefined` if the input is `undefined`.
 * Returns the query unchanged if no VertzQL keys are present.
 */
export function resolveVertzQL(
  query?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!query) return undefined;

  const encodedFields: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  let hasVertzQL = false;

  for (const key of Object.keys(query)) {
    if (query[key] === undefined) {
      rest[key] = query[key];
      continue;
    }

    if (ENCODED_KEYS.has(key)) {
      encodedFields[key] = query[key];
      hasVertzQL = true;
    } else if (key === 'where') {
      flattenWhere(query[key] as Record<string, unknown>, rest);
      hasVertzQL = true;
    } else if (key === 'orderBy') {
      rest.orderBy = flattenOrderBy(query[key] as Record<string, 'asc' | 'desc'>);
      hasVertzQL = true;
    } else if (key === 'limit') {
      rest.limit = query[key];
      hasVertzQL = true;
    } else {
      rest[key] = query[key];
    }
  }

  if (!hasVertzQL) return query;

  if (Object.keys(encodedFields).length > 0) {
    const q = encodeVertzQL(encodedFields as VertzQLParams);
    return { ...rest, q };
  }

  return rest;
}
