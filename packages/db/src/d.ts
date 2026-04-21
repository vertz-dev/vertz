import type {
  ColumnBuilder,
  DecimalMeta,
  DefaultMeta,
  EnumMeta,
  FormatMeta,
  JsonbValidator,
  NumericColumnBuilder,
  SerialMeta,
  StringColumnBuilder,
  VarcharMeta,
  VectorMeta,
} from './schema/column';
import { createColumn, createSerialColumn } from './schema/column';
import type { DateTruncPrecision, ExtractField, GroupByExpression } from './query/expression';
import { fnDate, fnDateTrunc, fnExtract } from './query/expression';
import type { DbExpr } from './sql/expr';
import type { SqlFragment } from './sql/tagged';
import { sql } from './sql/tagged';
import type { ModelDef, ValidateOneRelationFKs } from './schema/model';
import { createModel } from './schema/model';
import type { SchemaLike } from './schema/model-schemas';
import type { ManyRelationDef, RelationDef } from './schema/relation';
import { createManyRelation, createOneRelation } from './schema/relation';
import type {
  ColumnRecord,
  IndexDef,
  IndexOptions,
  MarkAsPrimary,
  TableDef,
  TableOptions,
  TableOptionsWithPK,
} from './schema/table';
import { createIndex, createTable } from './schema/table';

// Duck-typing interface so @vertz/db can accept EnumSchema from @vertz/schema
// without a hard runtime import (keeps the dependency boundary clean).
// Exported so consumers naming the d.enum(name, schema) overload (e.g. via
// `typeof d.enum`) don't trip TS2742 against @vertz/db/dist/d. See #2804.
export interface EnumSchemaLike<T extends readonly string[]> {
  readonly values: T;
}

export const d: {
  uuid(): ColumnBuilder<string, DefaultMeta<'uuid'>>;
  text(): StringColumnBuilder<string, DefaultMeta<'text'>>;
  varchar<TLength extends number>(
    length: TLength,
  ): StringColumnBuilder<string, VarcharMeta<TLength>>;
  email(): StringColumnBuilder<string, FormatMeta<'text', 'email'>>;
  boolean(): ColumnBuilder<boolean, DefaultMeta<'boolean'>>;
  integer(): NumericColumnBuilder<number, DefaultMeta<'integer'>>;
  bigint(): ColumnBuilder<bigint, DefaultMeta<'bigint'>>;
  decimal<TPrecision extends number, TScale extends number>(
    precision: TPrecision,
    scale: TScale,
  ): ColumnBuilder<string, DecimalMeta<TPrecision, TScale>>;
  real(): NumericColumnBuilder<number, DefaultMeta<'real'>>;
  doublePrecision(): NumericColumnBuilder<number, DefaultMeta<'double precision'>>;
  serial(): NumericColumnBuilder<number, SerialMeta>;
  timestamp(): ColumnBuilder<Date, DefaultMeta<'timestamp with time zone'>>;
  date(): ColumnBuilder<string, DefaultMeta<'date'>>;
  time(): ColumnBuilder<string, DefaultMeta<'time'>>;
  /**
   * JSONB column — stores a typed payload.
   *
   * - **Postgres:** native JSONB type. Supports string-keyed path filters
   *   (`'meta->k'`), typed `path()` filters, and whole-payload operators
   *   (`jsonContains`, `jsonContainedBy`, `hasKey`).
   * - **SQLite / Cloudflare D1:** stored as TEXT. On reads, values are
   *   automatically `JSON.parse`d into `T`. On writes, every JSON-compatible
   *   value — objects, arrays, strings, numbers, booleans — is automatically
   *   `JSON.stringify`d so the cell always holds valid JSON text. `null`
   *   passes through as SQL `NULL`.
   *
   * Path-based filters (`where: { 'meta->k': ... }`) and the typed operators
   * are Postgres-only. On SQLite they resolve to a branded `never` type
   * whose name reads as the recovery sentence. Fetch with `list()` and filter
   * in application code, or switch dialects. Inline the `where` object for
   * the best TS diagnostic when the gate triggers.
   *
   * Typed filter options (Postgres):
   *
   * ```ts
   * import { path } from '@vertz/db';
   * // Typed path — leaf type flows from the selector:
   * where: { meta: path((m: InstallMeta) => m.settings.theme).eq('dark') }
   * // Whole-payload subset containment (@>):
   * where: { meta: { jsonContains: { settings: { theme: 'dark' } } } }
   * // Top-level key existence (?):
   * where: { meta: { hasKey: 'displayName' } }
   * ```
   *
   * For `d.jsonb<string>()` (payloads that are themselves JSON-encoded strings),
   * the column-level string `contains` operator does a text LIKE match on the
   * raw JSON representation. Prefer `contains` for substring tests; `jsonContains`
   * tests whole-payload subset containment.
   *
   * An optional `validator` (provided either as a `{ validator }` option or
   * as a schema-like object exposing `.parse()`) runs on both sides:
   *
   * - **Reads:** the parsed value is passed through `validator.parse`; failures
   *   surface as `{ ok: false, error: { code: 'JSONB_VALIDATION_ERROR', ... } }`.
   * - **Writes (create / update / upsert):** the caller's payload is passed
   *   through `validator.parse` before the SQL is built. Invalid payloads
   *   surface as `{ code: 'JSONB_VALIDATION_ERROR' }` without reaching the
   *   driver. The validator's return value (not the caller's input) is what
   *   gets persisted — handy for Zod `.default()` / `.transform()` defaults.
   *   `error.value` on failure is the raw caller-provided input, so avoid
   *   attaching validators that carry secrets unless you're comfortable with
   *   that input appearing in error logs.
   */
  jsonb<T = unknown>(
    schemaOrOpts?: SchemaLike<T> | { validator: JsonbValidator<T> },
  ): ColumnBuilder<T, DefaultMeta<'jsonb'>>;
  textArray(): ColumnBuilder<string[], DefaultMeta<'text[]'>>;
  integerArray(): ColumnBuilder<number[], DefaultMeta<'integer[]'>>;
  vector<TDimensions extends number>(
    dimensions: TDimensions,
  ): ColumnBuilder<number[], VectorMeta<TDimensions>>;
  enum<TName extends string, const TValues extends readonly string[]>(
    name: TName,
    values: TValues,
  ): ColumnBuilder<TValues[number], EnumMeta<TName, TValues>>;
  enum<TName extends string, const TValues extends readonly [string, ...string[]]>(
    name: TName,
    schema: EnumSchemaLike<TValues>,
  ): ColumnBuilder<TValues[number], EnumMeta<TName, TValues>>;
  table<TColumns extends ColumnRecord, const TPK extends readonly (keyof TColumns & string)[]>(
    name: string,
    columns: TColumns,
    options: TableOptionsWithPK<TColumns, TPK>,
  ): TableDef<MarkAsPrimary<TColumns, TPK>>;
  table<TColumns extends ColumnRecord>(
    name: string,
    columns: TColumns,
    options?: TableOptions,
  ): TableDef<TColumns>;
  index(columns: string | string[], options?: IndexOptions): IndexDef;
  ref: {
    one<TTarget extends TableDef<ColumnRecord>, TFK extends string>(
      target: () => TTarget,
      foreignKey: TFK,
    ): RelationDef<TTarget, 'one', TFK>;
    many<TTarget extends TableDef<ColumnRecord>>(
      target: () => TTarget,
      foreignKey: Extract<keyof TTarget['_columns'], string>,
    ): RelationDef<TTarget, 'many'>;
    many<TTarget extends TableDef<ColumnRecord>>(target: () => TTarget): ManyRelationDef<TTarget>;
  };
  /** Column-relative SQL expression for update operations. */
  expr(build: (col: SqlFragment) => SqlFragment): DbExpr;
  /** Atomic increment: `SET col = col + value`. */
  increment(value: number): DbExpr;
  /** Atomic decrement: `SET col = col - value`. */
  decrement(value: number): DbExpr;
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents an empty relations record — the correct default for models without relations
  model<TTable extends TableDef<ColumnRecord>>(table: TTable): ModelDef<TTable, {}>;
  model<TTable extends TableDef<ColumnRecord>, TRelations extends Record<string, RelationDef>>(
    table: TTable,
    relations: TRelations & ValidateOneRelationFKs<TTable, TRelations>,
  ): ModelDef<TTable, TRelations>;
  fn: {
    /** DATE(column) — extract date part from a timestamp column. */
    date<TCol extends string>(column: TCol): GroupByExpression<TCol>;
    /** date_trunc(precision, column) — truncate timestamp to given precision. */
    dateTrunc<TCol extends string>(
      precision: DateTruncPrecision,
      column: TCol,
    ): GroupByExpression<TCol>;
    /** EXTRACT(field FROM column) — extract a date/time field from a timestamp column. */
    extract<TCol extends string>(field: ExtractField, column: TCol): GroupByExpression<TCol>;
  };
} = {
  uuid: () => createColumn<string, DefaultMeta<'uuid'>>('uuid'),
  text: () =>
    createColumn<string, DefaultMeta<'text'>>('text') as unknown as StringColumnBuilder<
      string,
      DefaultMeta<'text'>
    >,
  varchar: <TLength extends number>(length: TLength) =>
    createColumn<string, VarcharMeta<TLength>>('varchar', {
      length,
    }) as unknown as StringColumnBuilder<string, VarcharMeta<TLength>>,
  email: () =>
    createColumn<string, FormatMeta<'text', 'email'>>('text', {
      format: 'email',
    }) as unknown as StringColumnBuilder<string, FormatMeta<'text', 'email'>>,
  boolean: () => createColumn<boolean, DefaultMeta<'boolean'>>('boolean'),
  integer: () =>
    createColumn<number, DefaultMeta<'integer'>>('integer') as unknown as NumericColumnBuilder<
      number,
      DefaultMeta<'integer'>
    >,
  bigint: () => createColumn<bigint, DefaultMeta<'bigint'>>('bigint'),
  decimal: <TPrecision extends number, TScale extends number>(
    precision: TPrecision,
    scale: TScale,
  ) => createColumn<string, DecimalMeta<TPrecision, TScale>>('decimal', { precision, scale }),
  real: () =>
    createColumn<number, DefaultMeta<'real'>>('real') as unknown as NumericColumnBuilder<
      number,
      DefaultMeta<'real'>
    >,
  doublePrecision: () =>
    createColumn<number, DefaultMeta<'double precision'>>(
      'double precision',
    ) as unknown as NumericColumnBuilder<number, DefaultMeta<'double precision'>>,
  serial: () => createSerialColumn() as unknown as NumericColumnBuilder<number, SerialMeta>,
  timestamp: () =>
    createColumn<Date, DefaultMeta<'timestamp with time zone'>>('timestamp with time zone'),
  date: () => createColumn<string, DefaultMeta<'date'>>('date'),
  time: () => createColumn<string, DefaultMeta<'time'>>('time'),
  jsonb: <T = unknown>(schemaOrOpts?: SchemaLike<T> | { validator: JsonbValidator<T> }) => {
    // If it's a schema (has parse method but NOT validator property), use it directly
    if (schemaOrOpts && 'parse' in schemaOrOpts && !('validator' in schemaOrOpts)) {
      return createColumn<T, DefaultMeta<'jsonb'>>('jsonb', { validator: schemaOrOpts });
    }
    // Otherwise, it's a config object (or undefined)
    const opts = schemaOrOpts as { validator: JsonbValidator<T> } | undefined;
    return createColumn<T, DefaultMeta<'jsonb'>>(
      'jsonb',
      opts?.validator ? { validator: opts.validator } : {},
    );
  },
  vector: <TDimensions extends number>(dimensions: TDimensions) => {
    if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 16000) {
      throw new Error(
        `d.vector() dimensions must be an integer between 1 and 16000, got ${dimensions}`,
      );
    }
    return createColumn<number[], VectorMeta<TDimensions>>('vector', { dimensions });
  },
  textArray: () => createColumn<string[], DefaultMeta<'text[]'>>('text[]'),
  integerArray: () => createColumn<number[], DefaultMeta<'integer[]'>>('integer[]'),
  enum: <TName extends string, const TValues extends readonly string[]>(
    name: TName,
    valuesOrSchema: TValues | EnumSchemaLike<TValues>,
  ) => {
    const values =
      !Array.isArray(valuesOrSchema) &&
      typeof (valuesOrSchema as EnumSchemaLike<TValues>).values !== 'undefined'
        ? (valuesOrSchema as EnumSchemaLike<TValues>).values
        : (valuesOrSchema as TValues);
    return createColumn<TValues[number], EnumMeta<TName, TValues>>('enum', {
      enumName: name,
      enumValues: values,
    });
  },
  expr: (build) => ({ _tag: 'DbExpr' as const, build }),
  increment: (n) => ({ _tag: 'DbExpr' as const, build: (col: SqlFragment) => sql`${col} + ${n}` }),
  decrement: (n) => ({ _tag: 'DbExpr' as const, build: (col: SqlFragment) => sql`${col} - ${n}` }),
  table: createTable,
  index: (columns: string | string[], options?: IndexOptions) => createIndex(columns, options),
  ref: {
    one: <TTarget extends TableDef<ColumnRecord>, TFK extends string>(
      target: () => TTarget,
      foreignKey: TFK,
    ) => createOneRelation(target, foreignKey),
    many: <TTarget extends TableDef<ColumnRecord>>(
      target: () => TTarget,
      foreignKey?: Extract<keyof TTarget['_columns'], string>,
    ) => createManyRelation(target, foreignKey),
  },
  model: (table: TableDef<ColumnRecord>, relations: Record<string, RelationDef> = {}) =>
    createModel(table, relations),
  fn: {
    date: fnDate,
    dateTrunc: fnDateTrunc,
    extract: fnExtract,
  },
};
