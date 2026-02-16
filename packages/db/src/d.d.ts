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
interface EnumSchemaLike<T extends readonly string[]> {
  readonly values: T;
}
import type { TableEntry } from './schema/inference';
import type { ManyRelationDef, RelationDef } from './schema/relation';
import type { ColumnRecord, IndexDef, TableDef, TableOptions } from './schema/table';
export declare const d: {
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
  jsonb<T = unknown>(opts?: {
    validator: JsonbValidator<T>;
  }): ColumnBuilder<T, DefaultMeta<'jsonb'>>;
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
  entry<TTable extends TableDef<ColumnRecord>>(table: TTable): TableEntry<TTable, {}>;
  entry<TTable extends TableDef<ColumnRecord>, TRelations extends Record<string, RelationDef>>(
    table: TTable,
    relations: TRelations,
  ): TableEntry<TTable, TRelations>;
};
//# sourceMappingURL=d.d.ts.map
