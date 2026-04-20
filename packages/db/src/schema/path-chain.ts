/**
 * Type helpers for the typed JSONB operator surface (#2868).
 *
 * - `DeepPartial<T, D>` — depth-capped deep partial for `jsonContains`.
 * - `JsonbKeyOf<T>` — top-level keys of a JSONB payload; `never` for non-object T.
 * - `JsonbPayloadOperators<T, TDialect>` — dialect-gated operators for whole-payload
 *   filters on a JSONB column.
 * - `JsonbColumnValue<T, TDialect>` — union of all valid filter values for a
 *   `d.jsonb<T>()` column slot.
 *
 * The runtime `PathChain` / `JsonbPathDescriptor` lives in `../path.ts`
 * and is imported here for type composition.
 */

import type { DialectName } from '../dialect/types';
import type { JsonbPathDescriptor } from '../path';
import type { JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS } from './jsonb-filter-brand';

// ---------------------------------------------------------------------------
// DeepPartial<T, D> — depth-capped deep partial
// ---------------------------------------------------------------------------

type Decrement<D extends number> = [never, 0, 1, 2, 3, 4][D];

/**
 * Deep-partial `T` with a recursion depth cap (default 5).
 * Beyond the cap the recursion stops and the operand widens to `T`.
 * Cyclic types also degrade to `T` without inference blowup.
 */
export type DeepPartial<T, D extends number = 5> = [D] extends [never]
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepPartial<U, Decrement<D>>[]
    : T extends object
      ? { readonly [K in keyof T]?: DeepPartial<T[K], Decrement<D>> }
      : T;

// ---------------------------------------------------------------------------
// JsonbKeyOf<T> — safe key extractor
// ---------------------------------------------------------------------------

/**
 * Top-level keys for a JSONB payload shape. Distribution happens because
 * `T` is naked in the conditional (not because of `keyof` itself —
 * `keyof (A | B)` would intersect, but a distributive conditional splits
 * the union first and lets each variant contribute its own `keyof`).
 *
 * Primitive and array payloads resolve to `never`, so `hasKey` is not
 * meaningful on them and the type surface rejects the call.
 */
export type JsonbKeyOf<T> = T extends readonly unknown[]
  ? never
  : T extends object
    ? keyof T & string
    : never;

// ---------------------------------------------------------------------------
// JsonbPayloadOperators — whole-payload operators on the JSONB column slot
// ---------------------------------------------------------------------------

/**
 * Whole-payload JSONB operators, dialect-gated.
 * On Postgres: typed operands (`DeepPartial<T>`, `JsonbKeyOf<T>`).
 * On SQLite: the brand interface forces a diagnostic whose name IS the
 * recovery sentence.
 */
export type JsonbPayloadOperators<T, TDialect extends DialectName> = TDialect extends 'postgres'
  ? {
      readonly jsonContains?: DeepPartial<T>;
      readonly jsonContainedBy?: object;
      readonly hasKey?: JsonbKeyOf<T>;
    }
  : {
      readonly jsonContains?: JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS;
      readonly jsonContainedBy?: JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS;
      readonly hasKey?: JsonbOperator_Error_Requires_Dialect_Postgres_On_SQLite_Fetch_And_Filter_In_JS;
    };

// ---------------------------------------------------------------------------
// JsonbColumnValue — union of valid filter values for a d.jsonb<T>() slot
// ---------------------------------------------------------------------------

/**
 * Filter value for a `d.jsonb<T>()` column slot.
 *
 * On Postgres, accepts:
 * - The direct payload (shorthand for `{ eq: T }`).
 * - Simple comparison operators against full `T` (retained for back-compat).
 * - Payload operators (`jsonContains` / `jsonContainedBy` / `hasKey`).
 * - A `JsonbPathDescriptor` produced by the `path()` builder.
 *
 * On SQLite, the payload operators and descriptor slot resolve to the brand
 * type. Direct equality against `T` remains valid.
 *
 * NOTE: Union-member ordering in TS excess-property checks is not fully
 * deterministic across compiler versions. If the collision snapshot test
 * (`d.jsonb<{ jsonContains: string }>()` with payload-shape equality) flips,
 * the fallback is to reorder members or add explicit `& {}` marker
 * intersections. The snapshot is the source of truth.
 */
export type JsonbColumnValue<T, TDialect extends DialectName> = TDialect extends 'postgres'
  ?
      | T
      | { readonly eq?: T; readonly ne?: T; readonly isNull?: boolean }
      | JsonbPayloadOperators<T, 'postgres'>
      | JsonbPathDescriptor
  :
      | T
      | { readonly eq?: T; readonly ne?: T; readonly isNull?: boolean }
      | JsonbPayloadOperators<T, 'sqlite'>;
