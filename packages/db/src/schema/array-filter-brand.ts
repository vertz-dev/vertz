/**
 * Brand for the typed array-operator surface introduced by #2885
 * (`arrayContains`, `arrayContainedBy`, `arrayOverlaps` on
 * `d.textArray()` / `d.integerArray()` / `d.vector()` columns).
 *
 * Resolves in the SQLite branch of `ArrayOperatorSlots` so attempting any
 * of these ops on a SQLite db produces a diagnostic that names this
 * interface — the alias name IS the recovery sentence.
 *
 * Same pattern as `JsonbPathFilter_Error_…` (#2850) and
 * `JsonbOperator_Error_…` (#2868). See `jsonb-filter-brand.ts` for the
 * rationale on why the diagnostic name encodes the recovery sentence.
 *
 * Known limitation: excess-property checks only fire on fresh object
 * literals; the `where.ts` runtime throw at
 * `packages/db/src/sql/where.ts:264-296` remains the backstop for the
 * widened-variable case (`const dialect: DialectName = ...`).
 */
declare const __ArrayFilterBrand: unique symbol;

export interface ArrayFilter_Error_Requires_Dialect_Postgres_On_SQLite_Not_Supported {
  readonly [__ArrayFilterBrand]: 'array-filter-requires-postgres';
}
