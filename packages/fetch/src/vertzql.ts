export interface VertzQLParams {
  select?: Record<string, true>;
  include?: Record<string, true | { select: Record<string, true> }>;
}

/**
 * Encodes VertzQL parameters (select, include) into a base64url string
 * suitable for the `q=` query parameter.
 *
 * This is the client-side counterpart to `parseVertzQL` on the server.
 */
export function encodeVertzQL(params: VertzQLParams): string {
  const json = JSON.stringify(params);
  const b64 = btoa(json);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Extracts `select` and `include` from a query object, encodes them as a
 * base64url `q` parameter, and returns the cleaned query.
 *
 * Returns `undefined` if the input is `undefined`.
 * Returns the query unchanged if no `select` or `include` is present.
 */
export function resolveVertzQL(
  query?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!query) return undefined;

  const { select, include, ...rest } = query;
  if (!select && !include) return query;

  const q = encodeVertzQL({
    ...(select ? { select: select as Record<string, true> } : {}),
    ...(include
      ? { include: include as Record<string, true | { select: Record<string, true> }> }
      : {}),
  });

  return { ...rest, q };
}
