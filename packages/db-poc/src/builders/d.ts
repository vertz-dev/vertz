// ============================================================================
// Layer 2: The `d` Builder Namespace
// ============================================================================
// Runtime builders that produce typed ColumnDef, TableDef, RelationDef values.
// This is a TYPE-LEVEL POC. Runtime values are dummies.
// What matters: the TYPE of the return value.
// ============================================================================

import type {
  ColumnBuilder,
  ColumnDef,
  ColumnMeta,
  DefaultMeta,
} from '../types/column.js';
import type { RelationDef, TableDef } from '../types/table.js';

// ============================================================================
// Runtime column builder (dummy implementation, real types)
// ============================================================================

function makeColumnBuilder<TType, TMeta extends ColumnMeta = DefaultMeta>(): ColumnBuilder<TType, TMeta> {
  const builder = {
    _brand: 'ColumnDef' as const,
    _type: undefined as unknown as TType,
    _meta: undefined as unknown as TMeta,
    nullable: () => makeColumnBuilder<TType | null, any>(),
    default: () => makeColumnBuilder<TType, any>(),
    primary: () => makeColumnBuilder<TType, any>(),
    sensitive: () => makeColumnBuilder<TType, any>(),
    hidden: () => makeColumnBuilder<TType, any>(),
    unique: () => makeColumnBuilder<TType, any>(),
  };
  return builder as any;
}

// ============================================================================
// The `d` namespace
// ============================================================================

export const d = {
  // --- Column type builders ---

  /** UUID column (maps to string) */
  uuid: () => makeColumnBuilder<string>(),

  /** Text column (maps to string) */
  text: () => makeColumnBuilder<string>(),

  /** Integer column (maps to number) */
  integer: () => makeColumnBuilder<number>(),

  /** Float column (maps to number) */
  float: () => makeColumnBuilder<number>(),

  /** Boolean column (maps to boolean) */
  boolean: () => makeColumnBuilder<boolean>(),

  /** Timestamp column (maps to Date) */
  timestamp: () => makeColumnBuilder<Date>(),

  /** JSON/JSONB column (maps to a generic type or the specified type) */
  jsonb: <T = Record<string, unknown>>() => makeColumnBuilder<T>(),

  /** Enum column (maps to a string union) */
  enum: <T extends string>(..._values: T[]) => makeColumnBuilder<T>(),

  // --- Table builder ---

  /**
   * Define a table.
   * @param name - The table name (string literal)
   * @param columns - Record of column definitions
   * @param options - Optional relations
   */
  table: <
    TName extends string,
    TCols extends Record<string, ColumnBuilder<any, any>>,
    TRels extends Record<string, RelationDef> = Record<string, never>,
  >(
    name: TName,
    columns: TCols,
    options?: { relations?: TRels },
  ): TableDef<TName, {
    [K in keyof TCols]: TCols[K] extends ColumnBuilder<infer T, infer M>
      ? ColumnDef<T, M extends ColumnMeta ? M : DefaultMeta>
      : never;
  }, TRels extends Record<string, never> ? Record<string, never> : TRels> => {
    return {
      _brand: 'TableDef',
      _name: name,
      _columns: columns as any,
      _relations: (options?.relations ?? {}) as any,
    } as any;
  },

  // --- Relation builders ---

  ref: {
    /** One-to-one or many-to-one relation */
    one: <TTarget extends string>(
      _target: TTarget,
      _column?: string,
    ): RelationDef<'one', TTarget> => {
      return {
        _brand: 'RelationDef',
        _type: 'one',
        _target,
      } as any;
    },

    /** One-to-many relation */
    many: <TTarget extends string>(
      _target: TTarget,
    ): RelationDef<'many', TTarget> => {
      return {
        _brand: 'RelationDef',
        _type: 'many',
        _target,
      } as any;
    },
  },
} as const;
