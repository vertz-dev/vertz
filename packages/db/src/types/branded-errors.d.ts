/**
 * Branded error types for readable compiler messages.
 *
 * When developers pass invalid column names, relation names, or filter types,
 * TypeScript produces raw generic expansion errors that are hard to read.
 * These branded types produce clear, actionable error messages instead.
 *
 * @module
 */
/**
 * Produced when a column name in select/where/orderBy does not exist on the table.
 *
 * Example:
 *   `ERROR: Column 'nonExistent' does not exist on table 'users'.`
 */
export type InvalidColumn<
  K extends string,
  Table extends string,
> = `ERROR: Column '${K}' does not exist on table '${Table}'.`;
/**
 * Produced when a filter value has the wrong type.
 *
 * Example:
 *   `ERROR: Filter on 'age' expects type 'number', got 'string'.`
 */
export type InvalidFilterType<
  Col extends string,
  Expected extends string,
  Got extends string,
> = `ERROR: Filter on '${Col}' expects type '${Expected}', got '${Got}'.`;
/**
 * Produced when an include name does not match any declared relation.
 *
 * Example:
 *   `ERROR: Relation 'bogus' does not exist. Available relations: author, comments.`
 */
export type InvalidRelation<
  K extends string,
  Available extends string,
> = `ERROR: Relation '${K}' does not exist. Available relations: ${Available}.`;
/**
 * Produced when a select option mixes `not` with explicit field selection.
 *
 * Example:
 *   `ERROR: Cannot combine 'not' with explicit field selection in select.`
 */
export type MixedSelectError =
  "ERROR: Cannot combine 'not' with explicit field selection in select.";
/**
 * ValidateKeys<TKeys, TAllowed, TTable> — maps invalid keys to branded error messages.
 *
 * For each key K in TKeys:
 * - If K extends TAllowed, keep the original type
 * - Otherwise, produce an InvalidColumn error message
 */
export type ValidateKeys<
  TKeys extends Record<string, unknown>,
  TAllowed extends string,
  TTable extends string,
> = {
  [K in keyof TKeys]: K extends TAllowed ? TKeys[K] : InvalidColumn<K & string, TTable>;
};
/**
 * StrictKeys<TRecord, TAllowed, TTable> — validates that all keys in TRecord
 * are in the TAllowed union, producing branded errors for invalid keys.
 */
export type StrictKeys<TRecord, TAllowed extends string, TTable extends string> =
  TRecord extends Record<string, unknown>
    ? {
        [K in keyof TRecord]: K extends TAllowed ? TRecord[K] : InvalidColumn<K & string, TTable>;
      }
    : TRecord;
//# sourceMappingURL=branded-errors.d.ts.map
