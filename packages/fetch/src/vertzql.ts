/** Shape of a single include entry for VertzQL client params. */
export interface VertzQLIncludeEntry {
  select?: Record<string, true>;
  where?: Record<string, unknown>;
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
  include?: Record<string, true | VertzQLIncludeEntry>;
}

export interface VertzQLParams {
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

/** Keys that belong inside the encoded `q` parameter. */
const VERTZQL_KEYS = new Set(['select', 'include', 'where', 'orderBy', 'limit']);

/**
 * Extracts VertzQL keys (`select`, `include`, `where`, `orderBy`, `limit`)
 * from a query object, encodes them as a base64url `q` parameter, and
 * returns the remaining keys alongside `q`.
 *
 * Returns `undefined` if the input is `undefined`.
 * Returns the query unchanged if no VertzQL keys are present.
 */
export function resolveVertzQL(
  query?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!query) return undefined;

  const vertzqlFields: Record<string, unknown> = {};
  const rest: Record<string, unknown> = {};
  let hasVertzQL = false;

  for (const key of Object.keys(query)) {
    if (VERTZQL_KEYS.has(key) && query[key] !== undefined) {
      vertzqlFields[key] = query[key];
      hasVertzQL = true;
    } else {
      rest[key] = query[key];
    }
  }

  if (!hasVertzQL) return query;

  const q = encodeVertzQL(vertzqlFields as VertzQLParams);
  return { ...rest, q };
}
