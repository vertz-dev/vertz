import type {
  ColumnBuilder,
  DecimalMeta,
  DefaultMeta,
  EnumMeta,
  FormatMeta,
  JsonbValidator,
  SerialMeta,
  TenantMeta,
  VarcharMeta,
} from './schema/column';
import { createColumn, createSerialColumn, createTenantColumn } from './schema/column';
import type { TableEntry } from './schema/inference';
import type { ModelDef } from './schema/model';
import { createModel } from './schema/model';
import type { SchemaLike } from './schema/model-schemas';
import type { ManyRelationDef, RelationDef } from './schema/relation';
import { createManyRelation, createOneRelation } from './schema/relation';
import type { ColumnRecord, IndexDef, TableDef, TableOptions } from './schema/table';
import { createIndex, createTable } from './schema/table';

// Duck-typing interface so @vertz/db can accept EnumSchema from @vertz/schema
// without a hard runtime import (keeps the dependency boundary clean).
interface EnumSchemaLike<T extends readonly string[]> {
  readonly values: T;
}

export const d: {
  uuid(): ColumnBuilder<string, DefaultMeta<'uuid'>>;
  text(): ColumnBuilder<string, DefaultMeta<'text'>>;
  varchar<TLength extends number>(length: TLength): ColumnBuilder<string, VarcharMeta<TLength>>;
  email(): ColumnBuilder<string, FormatMeta<'text', 'email'>>;
  boolean(): ColumnBuilder<boolean, DefaultMeta<'boolean'>>;
  integer(): ColumnBuilder<number, DefaultMeta<'integer'>>;
  bigint(): ColumnBuilder<bigint, DefaultMeta<'bigint'>>;
  decimal<TPrecision extends number, TScale extends number>(
    precision: TPrecision,
    scale: TScale,
  ): ColumnBuilder<string, DecimalMeta<TPrecision, TScale>>;
  real(): ColumnBuilder<number, DefaultMeta<'real'>>;
  doublePrecision(): ColumnBuilder<number, DefaultMeta<'double precision'>>;
  serial(): ColumnBuilder<number, SerialMeta>;
  timestamp(): ColumnBuilder<Date, DefaultMeta<'timestamp with time zone'>>;
  date(): ColumnBuilder<string, DefaultMeta<'date'>>;
  time(): ColumnBuilder<string, DefaultMeta<'time'>>;
  jsonb<T = unknown>(
    schemaOrOpts?: SchemaLike<T> | { validator: JsonbValidator<T> },
  ): ColumnBuilder<T, DefaultMeta<'jsonb'>>;
  textArray(): ColumnBuilder<string[], DefaultMeta<'text[]'>>;
  integerArray(): ColumnBuilder<number[], DefaultMeta<'integer[]'>>;
  enum<TName extends string, const TValues extends readonly string[]>(
    name: TName,
    values: TValues,
  ): ColumnBuilder<TValues[number], EnumMeta<TName, TValues>>;
  enum<TName extends string, const TValues extends readonly [string, ...string[]]>(
    name: TName,
    schema: EnumSchemaLike<TValues>,
  ): ColumnBuilder<TValues[number], EnumMeta<TName, TValues>>;
  tenant(targetTable: TableDef<ColumnRecord>): ColumnBuilder<string, TenantMeta>;
  table<TColumns extends ColumnRecord>(
    name: string,
    columns: TColumns,
    options?: TableOptions,
  ): TableDef<TColumns>;
  index(columns: string | string[]): IndexDef;
  ref: {
    one<TTarget extends TableDef<ColumnRecord>>(
      target: () => TTarget,
      foreignKey: string,
    ): RelationDef<TTarget, 'one'>;
    many<TTarget extends TableDef<ColumnRecord>>(
      target: () => TTarget,
      foreignKey: string,
    ): RelationDef<TTarget, 'many'>;
    many<TTarget extends TableDef<ColumnRecord>>(target: () => TTarget): ManyRelationDef<TTarget>;
  };
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty relations record — the correct default for tables without relations
  entry<TTable extends TableDef<ColumnRecord>>(table: TTable): TableEntry<TTable, {}>;
  entry<TTable extends TableDef<ColumnRecord>, TRelations extends Record<string, RelationDef>>(
    table: TTable,
    relations: TRelations,
  ): TableEntry<TTable, TRelations>;
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty relations record — the correct default for models without relations
  model<TTable extends TableDef<ColumnRecord>>(table: TTable): ModelDef<TTable, {}>;
  model<TTable extends TableDef<ColumnRecord>, TRelations extends Record<string, RelationDef>>(
    table: TTable,
    relations: TRelations,
  ): ModelDef<TTable, TRelations>;
} = {
  uuid: () => createColumn<string, DefaultMeta<'uuid'>>('uuid'),
  text: () => createColumn<string, DefaultMeta<'text'>>('text'),
  varchar: <TLength extends number>(length: TLength) =>
    createColumn<string, VarcharMeta<TLength>>('varchar', { length }),
  email: () => createColumn<string, FormatMeta<'text', 'email'>>('text', { format: 'email' }),
  boolean: () => createColumn<boolean, DefaultMeta<'boolean'>>('boolean'),
  integer: () => createColumn<number, DefaultMeta<'integer'>>('integer'),
  bigint: () => createColumn<bigint, DefaultMeta<'bigint'>>('bigint'),
  decimal: <TPrecision extends number, TScale extends number>(
    precision: TPrecision,
    scale: TScale,
  ) => createColumn<string, DecimalMeta<TPrecision, TScale>>('decimal', { precision, scale }),
  real: () => createColumn<number, DefaultMeta<'real'>>('real'),
  doublePrecision: () => createColumn<number, DefaultMeta<'double precision'>>('double precision'),
  serial: () => createSerialColumn(),
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
  tenant: (targetTable: TableDef<ColumnRecord>) => createTenantColumn(targetTable._name),
  table: <TColumns extends ColumnRecord>(name: string, columns: TColumns, options?: TableOptions) =>
    createTable(name, columns, options),
  index: (columns: string | string[]) => createIndex(columns),
  ref: {
    one: <TTarget extends TableDef<ColumnRecord>>(target: () => TTarget, foreignKey: string) =>
      createOneRelation(target, foreignKey),
    many: <TTarget extends TableDef<ColumnRecord>>(target: () => TTarget, foreignKey?: string) =>
      createManyRelation(target, foreignKey),
  },
  entry: (table: TableDef<ColumnRecord>, relations: Record<string, RelationDef> = {}) => ({
    table,
    relations,
  }),
  model: (table: TableDef<ColumnRecord>, relations: Record<string, RelationDef> = {}) =>
    createModel(table, relations),
};
