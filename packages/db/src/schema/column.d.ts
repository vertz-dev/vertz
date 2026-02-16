export interface JsonbValidator<T> {
  parse(value: unknown): T;
}
export interface ColumnMetadata {
  readonly sqlType: string;
  readonly primary: boolean;
  readonly unique: boolean;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly sensitive: boolean;
  readonly hidden: boolean;
  readonly isTenant: boolean;
  readonly references: {
    readonly table: string;
    readonly column: string;
  } | null;
  readonly check: string | null;
  readonly defaultValue?: unknown;
  readonly format?: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly enumName?: string;
  readonly enumValues?: readonly string[];
  readonly validator?: JsonbValidator<unknown>;
}
/** Phantom symbol to carry the TypeScript type without a runtime value. */
declare const PhantomType: unique symbol;
export interface ColumnBuilder<TType, TMeta extends ColumnMetadata = ColumnMetadata> {
  /** Phantom field -- only exists at the type level for inference. Do not access at runtime. */
  readonly [PhantomType]: TType;
  readonly _meta: TMeta;
  primary(): ColumnBuilder<
    TType,
    Omit<TMeta, 'primary' | 'hasDefault'> & {
      readonly primary: true;
      readonly hasDefault: true;
    }
  >;
  unique(): ColumnBuilder<
    TType,
    Omit<TMeta, 'unique'> & {
      readonly unique: true;
    }
  >;
  nullable(): ColumnBuilder<
    TType | null,
    Omit<TMeta, 'nullable'> & {
      readonly nullable: true;
    }
  >;
  default(value: TType | 'now'): ColumnBuilder<
    TType,
    Omit<TMeta, 'hasDefault'> & {
      readonly hasDefault: true;
      readonly defaultValue: TType | 'now';
    }
  >;
  sensitive(): ColumnBuilder<
    TType,
    Omit<TMeta, 'sensitive'> & {
      readonly sensitive: true;
    }
  >;
  hidden(): ColumnBuilder<
    TType,
    Omit<TMeta, 'hidden'> & {
      readonly hidden: true;
    }
  >;
  check(sql: string): ColumnBuilder<
    TType,
    Omit<TMeta, 'check'> & {
      readonly check: string;
    }
  >;
  references(
    table: string,
    column?: string,
  ): ColumnBuilder<
    TType,
    Omit<TMeta, 'references'> & {
      readonly references: {
        readonly table: string;
        readonly column: string;
      };
    }
  >;
}
export type InferColumnType<C> = C extends ColumnBuilder<infer T, ColumnMetadata> ? T : never;
export type DefaultMeta<TSqlType extends string> = {
  readonly sqlType: TSqlType;
  readonly primary: false;
  readonly unique: false;
  readonly nullable: false;
  readonly hasDefault: false;
  readonly sensitive: false;
  readonly hidden: false;
  readonly isTenant: false;
  readonly references: null;
  readonly check: null;
};
/** Metadata for varchar columns — carries the length constraint. */
export type VarcharMeta<TLength extends number> = DefaultMeta<'varchar'> & {
  readonly length: TLength;
};
/** Metadata for decimal/numeric columns — carries precision and scale. */
export type DecimalMeta<
  TPrecision extends number,
  TScale extends number,
> = DefaultMeta<'decimal'> & {
  readonly precision: TPrecision;
  readonly scale: TScale;
};
/** Metadata for enum columns — carries the enum name and its values. */
export type EnumMeta<
  TName extends string,
  TValues extends readonly string[],
> = DefaultMeta<'enum'> & {
  readonly enumName: TName;
  readonly enumValues: TValues;
};
/** Metadata for columns with a format constraint (e.g., email). */
export type FormatMeta<TSqlType extends string, TFormat extends string> = DefaultMeta<TSqlType> & {
  readonly format: TFormat;
};
export declare function createColumn<TType, TMeta extends ColumnMetadata>(
  sqlType: string,
  extra?: Record<string, unknown>,
): ColumnBuilder<TType, TMeta>;
export type SerialMeta = {
  readonly sqlType: 'serial';
  readonly primary: false;
  readonly unique: false;
  readonly nullable: false;
  readonly hasDefault: true;
  readonly sensitive: false;
  readonly hidden: false;
  readonly isTenant: false;
  readonly references: null;
  readonly check: null;
};
export declare function createSerialColumn(): ColumnBuilder<number, SerialMeta>;
export type TenantMeta = {
  readonly sqlType: 'uuid';
  readonly primary: false;
  readonly unique: false;
  readonly nullable: false;
  readonly hasDefault: false;
  readonly sensitive: false;
  readonly hidden: false;
  readonly isTenant: true;
  readonly references: {
    readonly table: string;
    readonly column: string;
  };
  readonly check: null;
};
export declare function createTenantColumn(
  targetTableName: string,
): ColumnBuilder<string, TenantMeta>;
//# sourceMappingURL=column.d.ts.map
