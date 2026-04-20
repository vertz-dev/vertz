/**
 * Bare `never` aliases whose *name* is the diagnostic. When a path-shaped
 * key like `'meta->displayName'` is assigned a value on SQLite, the operand
 * fails to match this type and TypeScript reports:
 *
 *     Type '{ eq: string }' is not assignable to type
 *     'JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS'.
 *
 * The type alias name IS the recovery sentence. `d.jsonb()` JSDoc embeds the
 * same sentence verbatim so LLM retrieval lands on the same string whether
 * the entry point is the TypeScript error or the doc.
 *
 * Known limitation: excess-property checks only fire on fresh object
 * literals; the `where.ts` runtime throw remains the backstop for the
 * widened-variable case (`const dialect: DialectName = ...`).
 */
/**
 * A unique brand key — paired with the alias below, this forces TS to name
 * the alias in the "not assignable to type '…'" diagnostic instead of
 * collapsing to `undefined` via optional-property semantics.
 */
declare const __JsonbPathFilterBrand: unique symbol;

export interface JsonbPathFilter_Error_Requires_Dialect_Postgres_On_SQLite_Use_list_And_Filter_In_JS {
  readonly [__JsonbPathFilterBrand]: 'jsonb-path-filter-requires-postgres';
}

/**
 * Brand for the typed-JSONB-operator surface introduced by #2868
 * (`jsonContains`, `jsonContainedBy`, `hasKey`, and the `path()` builder).
 * Resolves in the SQLite branch of the JSONB column filter value so that
 * attempting any of these ops on a SQLite db produces a diagnostic that
 * names this interface — the name IS the recovery sentence.
 */
declare const __JsonbOperatorBrand: unique symbol;

export interface JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS {
  readonly [__JsonbOperatorBrand]: 'jsonb-operator-requires-postgres';
}
