export interface JsonbValidator<T> {
  parse(value: unknown): T;
}

export interface ColumnMetadata {
  readonly sqlType: string;
  readonly primary: boolean;
  readonly unique: boolean;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly _annotations: Record<string, true>;
  readonly isReadOnly: boolean;
  readonly isAutoUpdate: boolean;
  readonly check: string | null;
  readonly defaultValue?: unknown;
  readonly format?: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly enumName?: string;
  readonly enumValues?: readonly string[];
  readonly validator?: JsonbValidator<unknown>;
  readonly generate?: 'cuid' | 'uuid' | 'nanoid';
}

/** Phantom symbol to carry the TypeScript type without a runtime value. */
declare const PhantomType: unique symbol;

export interface ColumnBuilder<TType, TMeta extends ColumnMetadata = ColumnMetadata> {
  /** Phantom field -- only exists at the type level for inference. Do not access at runtime. */
  readonly [PhantomType]: TType;
  readonly _meta: TMeta;

  primary(options?: { generate?: 'cuid' | 'uuid' | 'nanoid'; generated?: boolean }): ColumnBuilder<
    TType,
    Omit<TMeta, 'primary' | 'hasDefault' | 'generate'> & {
      readonly primary: true;
      readonly hasDefault: true;
      readonly generate?: 'cuid' | 'uuid' | 'nanoid';
    }
  >;
  unique(): ColumnBuilder<TType, Omit<TMeta, 'unique'> & { readonly unique: true }>;
  nullable(): ColumnBuilder<TType | null, Omit<TMeta, 'nullable'> & { readonly nullable: true }>;
  default(
    value: TType | 'now',
  ): ColumnBuilder<
    TType,
    Omit<TMeta, 'hasDefault'> & { readonly hasDefault: true; readonly defaultValue: TType | 'now' }
  >;
  is<TFlag extends string>(
    flag: TFlag,
  ): ColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly [K in TFlag]: true };
    }
  >;
  readOnly(): ColumnBuilder<TType, Omit<TMeta, 'isReadOnly'> & { readonly isReadOnly: true }>;
  autoUpdate(): ColumnBuilder<
    TType,
    Omit<TMeta, 'isAutoUpdate' | 'isReadOnly' | 'hasDefault'> & {
      readonly isAutoUpdate: true;
      readonly isReadOnly: true;
      readonly hasDefault: true;
    }
  >;
  check(sql: string): ColumnBuilder<TType, Omit<TMeta, 'check'> & { readonly check: string }>;
}

export type InferColumnType<C> = C extends ColumnBuilder<infer T, ColumnMetadata> ? T : never;

export type DefaultMeta<TSqlType extends string> = {
  readonly sqlType: TSqlType;
  readonly primary: false;
  readonly unique: false;
  readonly nullable: false;
  readonly hasDefault: false;
  readonly _annotations: {};
  readonly isReadOnly: false;
  readonly isAutoUpdate: false;
  readonly check: null;
};

// ---------------------------------------------------------------------------
// Column-type-specific metadata extensions
// ---------------------------------------------------------------------------

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

function cloneWith(
  source: ColumnBuilder<unknown, ColumnMetadata>,
  metaOverrides: Record<string, unknown>,
): ColumnBuilder<unknown, ColumnMetadata> {
  return createColumnWithMeta({ ...source._meta, ...metaOverrides });
}

function createColumnWithMeta(meta: ColumnMetadata): ColumnBuilder<unknown, ColumnMetadata> {
  const col: ColumnBuilder<unknown, ColumnMetadata> = {
    _meta: meta,
    primary(options?: { generate?: 'cuid' | 'uuid' | 'nanoid'; generated?: boolean }) {
      const meta: Record<string, unknown> = { primary: true, hasDefault: true };
      if (options?.generate) {
        meta.generate = options.generate;
      } else if (this._meta.sqlType === 'uuid' && options?.generated !== false) {
        meta.generate = 'uuid';
      }
      return cloneWith(this, meta) as ReturnType<ColumnBuilder<unknown, ColumnMetadata>['primary']>;
    },
    unique() {
      return cloneWith(this, { unique: true }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['unique']
      >;
    },
    nullable() {
      return cloneWith(this, { nullable: true }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['nullable']
      >;
    },
    default(value: unknown) {
      return cloneWith(this, { hasDefault: true, defaultValue: value }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['default']
      >;
    },
    is(flag: string) {
      return createColumnWithMeta({
        ...this._meta,
        _annotations: { ...this._meta._annotations, [flag]: true as const },
      }) as ReturnType<ColumnBuilder<unknown, ColumnMetadata>['is']>;
    },
    readOnly() {
      return cloneWith(this, { isReadOnly: true }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['readOnly']
      >;
    },
    autoUpdate() {
      return cloneWith(this, {
        isAutoUpdate: true,
        isReadOnly: true,
        hasDefault: true,
      }) as ReturnType<ColumnBuilder<unknown, ColumnMetadata>['autoUpdate']>;
    },
    check(sql: string) {
      return cloneWith(this, { check: sql }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['check']
      >;
    },
  } as ColumnBuilder<unknown, ColumnMetadata>;
  return col;
}

function defaultMeta<TSqlType extends string>(sqlType: TSqlType): DefaultMeta<TSqlType> {
  return {
    sqlType,
    primary: false,
    unique: false,
    nullable: false,
    hasDefault: false,
    _annotations: {},
    isReadOnly: false,
    isAutoUpdate: false,
    check: null,
  };
}

export function createColumn<TType, TMeta extends ColumnMetadata>(
  sqlType: string,
  extra?: Record<string, unknown>,
): ColumnBuilder<TType, TMeta> {
  return createColumnWithMeta({
    ...defaultMeta(sqlType),
    ...extra,
  }) as ColumnBuilder<TType, TMeta>;
}

export type SerialMeta = {
  readonly sqlType: 'serial';
  readonly primary: false;
  readonly unique: false;
  readonly nullable: false;
  readonly hasDefault: true;
  readonly _annotations: {};
  readonly isReadOnly: false;
  readonly isAutoUpdate: false;
  readonly check: null;
};

export function createSerialColumn(): ColumnBuilder<number, SerialMeta> {
  return createColumnWithMeta({
    sqlType: 'serial',
    primary: false,
    unique: false,
    nullable: false,
    hasDefault: true,
    _annotations: {},
    isReadOnly: false,
    isAutoUpdate: false,
    check: null,
  }) as ColumnBuilder<number, SerialMeta>;
}
