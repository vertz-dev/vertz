import type { ColumnBuilder, DefaultMeta, JsonbValidator, SerialMeta } from './schema/column';
import { createColumn, createSerialColumn } from './schema/column';
import type { ManyRelationDef, RelationDef } from './schema/relation';
import { createManyRelation, createOneRelation } from './schema/relation';
import type { ColumnRecord, IndexDef, TableDef, TableOptions } from './schema/table';
import { createIndex, createTable } from './schema/table';

export const d: {
  uuid(): ColumnBuilder<string, DefaultMeta<'uuid'>>;
  text(): ColumnBuilder<string, DefaultMeta<'text'>>;
  varchar(length: number): ColumnBuilder<string, DefaultMeta<'varchar'>>;
  email(): ColumnBuilder<string, DefaultMeta<'text'>>;
  boolean(): ColumnBuilder<boolean, DefaultMeta<'boolean'>>;
  integer(): ColumnBuilder<number, DefaultMeta<'integer'>>;
  bigint(): ColumnBuilder<bigint, DefaultMeta<'bigint'>>;
  decimal(precision: number, scale: number): ColumnBuilder<string, DefaultMeta<'decimal'>>;
  real(): ColumnBuilder<number, DefaultMeta<'real'>>;
  doublePrecision(): ColumnBuilder<number, DefaultMeta<'double precision'>>;
  serial(): ColumnBuilder<number, SerialMeta>;
  timestamp(): ColumnBuilder<Date, DefaultMeta<'timestamp with time zone'>>;
  date(): ColumnBuilder<string, DefaultMeta<'date'>>;
  time(): ColumnBuilder<string, DefaultMeta<'time'>>;
  jsonb<T = unknown>(opts?: {
    validator: JsonbValidator<T>;
  }): ColumnBuilder<T, DefaultMeta<'jsonb'>>;
  textArray(): ColumnBuilder<string[], DefaultMeta<'text[]'>>;
  integerArray(): ColumnBuilder<number[], DefaultMeta<'integer[]'>>;
  enum<TName extends string, const TValues extends readonly string[]>(
    name: TName,
    values: TValues,
  ): ColumnBuilder<TValues[number], DefaultMeta<'enum'>>;
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
} = {
  uuid: () => createColumn<string, 'uuid'>('uuid'),
  text: () => createColumn<string, 'text'>('text'),
  varchar: (length: number) => createColumn<string, 'varchar'>('varchar', { length }),
  email: () => createColumn<string, 'text'>('text', { format: 'email' }),
  boolean: () => createColumn<boolean, 'boolean'>('boolean'),
  integer: () => createColumn<number, 'integer'>('integer'),
  bigint: () => createColumn<bigint, 'bigint'>('bigint'),
  decimal: (precision: number, scale: number) =>
    createColumn<string, 'decimal'>('decimal', { precision, scale }),
  real: () => createColumn<number, 'real'>('real'),
  doublePrecision: () => createColumn<number, 'double precision'>('double precision'),
  serial: () => createSerialColumn(),
  timestamp: () => createColumn<Date, 'timestamp with time zone'>('timestamp with time zone'),
  date: () => createColumn<string, 'date'>('date'),
  time: () => createColumn<string, 'time'>('time'),
  jsonb: <T = unknown>(opts?: { validator: JsonbValidator<T> }) =>
    createColumn<T, 'jsonb'>('jsonb', opts?.validator ? { validator: opts.validator } : {}),
  textArray: () => createColumn<string[], 'text[]'>('text[]'),
  integerArray: () => createColumn<number[], 'integer[]'>('integer[]'),
  enum: <TName extends string, const TValues extends readonly string[]>(
    name: TName,
    values: TValues,
  ) => createColumn<TValues[number], 'enum'>('enum', { enumName: name, enumValues: values }),
  table: <TColumns extends ColumnRecord>(name: string, columns: TColumns, options?: TableOptions) =>
    createTable(name, columns, options),
  index: (columns: string | string[]) => createIndex(columns),
  ref: {
    one: <TTarget extends TableDef<ColumnRecord>>(target: () => TTarget, foreignKey: string) =>
      createOneRelation(target, foreignKey),
    many: <TTarget extends TableDef<ColumnRecord>>(target: () => TTarget, foreignKey?: string) =>
      createManyRelation(target, foreignKey),
  },
};
