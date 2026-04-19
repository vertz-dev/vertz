/**
 * Keyed-never branded types that show up in place of dialect-gated filter
 * keys on SQLite. The whole name of the key IS the diagnostic — TypeScript's
 * excess-property check quotes the key verbatim, turning:
 *
 *     where: { 'meta->displayName': { eq: 'Acme' } }
 *
 * into:
 *
 *     Type '{ "meta->displayName": { eq: string } }' is not assignable to
 *     type 'JsonbPathFilter_Error_Requires_Dialect_Postgres_…'.
 *     Object literal may only specify known properties, and
 *     ''meta->displayName'' does not exist in type
 *     'JsonbPathFilter_Error_Requires_Dialect_Postgres_…'.
 *
 * so the developer reads the recovery path directly in the error message.
 * Known limitation: excess-property checks only fire on fresh object
 * literals; the `where.ts` runtime throw remains the backstop for the
 * widened-variable case.
 */
export type JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS =
  never;

export type JsonbPathFilterGuard = {
  readonly [K in 'JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS']: K;
};

export type ArrayOpFilter_Error_Requires_Dialect_Postgres_Array_Operators_Not_Supported_On_SQLite =
  never;

export type ArrayOpFilterGuard = {
  readonly [K in 'ArrayOpFilter_Error_Requires_Dialect_Postgres_Array_Operators_Not_Supported_On_SQLite']: K;
};
