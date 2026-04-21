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

  readonly dimensions?: number;

  // Application-level validation constraints (not stored in migration snapshots)
  readonly _minLength?: number;
  readonly _maxLength?: number;
  readonly _regex?: RegExp;
  readonly _minValue?: number;
  readonly _maxValue?: number;
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
  hidden(): ColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
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

// ---------------------------------------------------------------------------
// Specialized column builders with validation constraint methods
// ---------------------------------------------------------------------------

/** String column builder — adds .min(), .max(), .regex() for string-type columns. */
export interface StringColumnBuilder<
  TType,
  TMeta extends ColumnMetadata = ColumnMetadata,
> extends ColumnBuilder<TType, TMeta> {
  min(n: number): StringColumnBuilder<TType, TMeta>;
  max(n: number): StringColumnBuilder<TType, TMeta>;
  regex(pattern: RegExp): StringColumnBuilder<TType, TMeta>;

  // Redeclare base methods to preserve StringColumnBuilder return type through chaining
  primary(options?: {
    generate?: 'cuid' | 'uuid' | 'nanoid';
    generated?: boolean;
  }): StringColumnBuilder<
    TType,
    Omit<TMeta, 'primary' | 'hasDefault' | 'generate'> & {
      readonly primary: true;
      readonly hasDefault: true;
      readonly generate?: 'cuid' | 'uuid' | 'nanoid';
    }
  >;
  unique(): StringColumnBuilder<TType, Omit<TMeta, 'unique'> & { readonly unique: true }>;
  nullable(): StringColumnBuilder<
    TType | null,
    Omit<TMeta, 'nullable'> & { readonly nullable: true }
  >;
  default(
    value: TType | 'now',
  ): StringColumnBuilder<
    TType,
    Omit<TMeta, 'hasDefault'> & { readonly hasDefault: true; readonly defaultValue: TType | 'now' }
  >;
  is<TFlag extends string>(
    flag: TFlag,
  ): StringColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly [K in TFlag]: true };
    }
  >;
  hidden(): StringColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
    }
  >;
  readOnly(): StringColumnBuilder<TType, Omit<TMeta, 'isReadOnly'> & { readonly isReadOnly: true }>;
  autoUpdate(): StringColumnBuilder<
    TType,
    Omit<TMeta, 'isAutoUpdate' | 'isReadOnly' | 'hasDefault'> & {
      readonly isAutoUpdate: true;
      readonly isReadOnly: true;
      readonly hasDefault: true;
    }
  >;
  check(sql: string): StringColumnBuilder<TType, Omit<TMeta, 'check'> & { readonly check: string }>;
}

/** Bytes column builder — adds .min(), .max() for byte-length constraints. */
export interface BytesColumnBuilder<
  TType,
  TMeta extends ColumnMetadata = ColumnMetadata,
> extends ColumnBuilder<TType, TMeta> {
  min(n: number): BytesColumnBuilder<TType, TMeta>;
  max(n: number): BytesColumnBuilder<TType, TMeta>;

  // Redeclare base methods to preserve BytesColumnBuilder return type through chaining
  primary(options?: {
    generate?: 'cuid' | 'uuid' | 'nanoid';
    generated?: boolean;
  }): BytesColumnBuilder<
    TType,
    Omit<TMeta, 'primary' | 'hasDefault' | 'generate'> & {
      readonly primary: true;
      readonly hasDefault: true;
      readonly generate?: 'cuid' | 'uuid' | 'nanoid';
    }
  >;
  unique(): BytesColumnBuilder<TType, Omit<TMeta, 'unique'> & { readonly unique: true }>;
  nullable(): BytesColumnBuilder<
    TType | null,
    Omit<TMeta, 'nullable'> & { readonly nullable: true }
  >;
  default(
    value: TType | 'now',
  ): BytesColumnBuilder<
    TType,
    Omit<TMeta, 'hasDefault'> & { readonly hasDefault: true; readonly defaultValue: TType | 'now' }
  >;
  is<TFlag extends string>(
    flag: TFlag,
  ): BytesColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly [K in TFlag]: true };
    }
  >;
  hidden(): BytesColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
    }
  >;
  readOnly(): BytesColumnBuilder<TType, Omit<TMeta, 'isReadOnly'> & { readonly isReadOnly: true }>;
  autoUpdate(): BytesColumnBuilder<
    TType,
    Omit<TMeta, 'isAutoUpdate' | 'isReadOnly' | 'hasDefault'> & {
      readonly isAutoUpdate: true;
      readonly isReadOnly: true;
      readonly hasDefault: true;
    }
  >;
  check(sql: string): BytesColumnBuilder<TType, Omit<TMeta, 'check'> & { readonly check: string }>;
}

/** Numeric column builder — adds .min(), .max() for numeric-type columns. */
export interface NumericColumnBuilder<
  TType,
  TMeta extends ColumnMetadata = ColumnMetadata,
> extends ColumnBuilder<TType, TMeta> {
  min(n: number): NumericColumnBuilder<TType, TMeta>;
  max(n: number): NumericColumnBuilder<TType, TMeta>;

  // Redeclare base methods to preserve NumericColumnBuilder return type through chaining
  primary(options?: {
    generate?: 'cuid' | 'uuid' | 'nanoid';
    generated?: boolean;
  }): NumericColumnBuilder<
    TType,
    Omit<TMeta, 'primary' | 'hasDefault' | 'generate'> & {
      readonly primary: true;
      readonly hasDefault: true;
      readonly generate?: 'cuid' | 'uuid' | 'nanoid';
    }
  >;
  unique(): NumericColumnBuilder<TType, Omit<TMeta, 'unique'> & { readonly unique: true }>;
  nullable(): NumericColumnBuilder<
    TType | null,
    Omit<TMeta, 'nullable'> & { readonly nullable: true }
  >;
  default(
    value: TType | 'now',
  ): NumericColumnBuilder<
    TType,
    Omit<TMeta, 'hasDefault'> & { readonly hasDefault: true; readonly defaultValue: TType | 'now' }
  >;
  is<TFlag extends string>(
    flag: TFlag,
  ): NumericColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly [K in TFlag]: true };
    }
  >;
  hidden(): NumericColumnBuilder<
    TType,
    Omit<TMeta, '_annotations'> & {
      readonly _annotations: TMeta['_annotations'] & { readonly hidden: true };
    }
  >;
  readOnly(): NumericColumnBuilder<
    TType,
    Omit<TMeta, 'isReadOnly'> & { readonly isReadOnly: true }
  >;
  autoUpdate(): NumericColumnBuilder<
    TType,
    Omit<TMeta, 'isAutoUpdate' | 'isReadOnly' | 'hasDefault'> & {
      readonly isAutoUpdate: true;
      readonly isReadOnly: true;
      readonly hasDefault: true;
    }
  >;
  check(
    sql: string,
  ): NumericColumnBuilder<TType, Omit<TMeta, 'check'> & { readonly check: string }>;
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

/** Metadata for vector columns — carries the dimension count. */
export type VectorMeta<TDimensions extends number> = DefaultMeta<'vector'> & {
  readonly dimensions: TDimensions;
};

/** Metadata for columns with a format constraint (e.g., email). */
export type FormatMeta<TSqlType extends string, TFormat extends string> = DefaultMeta<TSqlType> & {
  readonly format: TFormat;
};

/**
 * Internal runtime shape for column builders. Includes constraint methods
 * so TypeScript recognizes them inside the implementation. The public API uses
 * StringColumnBuilder / NumericColumnBuilder / ColumnBuilder to scope visibility.
 */
interface ColumnBuilderImpl {
  readonly _meta: ColumnMetadata;
  primary(options?: {
    generate?: 'cuid' | 'uuid' | 'nanoid';
    generated?: boolean;
  }): ColumnBuilderImpl;
  unique(): ColumnBuilderImpl;
  nullable(): ColumnBuilderImpl;
  default(value: unknown): ColumnBuilderImpl;
  is(flag: string): ColumnBuilderImpl;
  hidden(): ColumnBuilderImpl;
  readOnly(): ColumnBuilderImpl;
  autoUpdate(): ColumnBuilderImpl;
  check(sql: string): ColumnBuilderImpl;
  min(n: number): ColumnBuilderImpl;
  max(n: number): ColumnBuilderImpl;
  regex(pattern: RegExp): ColumnBuilderImpl;
}

function cloneWith(
  source: ColumnBuilderImpl,
  metaOverrides: Record<string, unknown>,
): ColumnBuilderImpl {
  return createColumnWithMeta({ ...source._meta, ...metaOverrides });
}

function createColumnWithMeta(meta: ColumnMetadata): ColumnBuilderImpl {
  const col: ColumnBuilderImpl = {
    _meta: meta,
    primary(options?: { generate?: 'cuid' | 'uuid' | 'nanoid'; generated?: boolean }) {
      const meta: Record<string, unknown> = { primary: true, hasDefault: true };
      if (options?.generate) {
        meta.generate = options.generate;
      } else if (this._meta.sqlType === 'uuid' && options?.generated !== false) {
        meta.generate = 'uuid';
      }
      return cloneWith(this, meta);
    },
    unique() {
      return cloneWith(this, { unique: true });
    },
    nullable() {
      return cloneWith(this, { nullable: true });
    },
    default(value: unknown) {
      return cloneWith(this, { hasDefault: true, defaultValue: value });
    },
    is(flag: string) {
      return createColumnWithMeta({
        ...this._meta,
        _annotations: { ...this._meta._annotations, [flag]: true as const },
      });
    },
    hidden() {
      return this.is('hidden');
    },
    readOnly() {
      return cloneWith(this, { isReadOnly: true });
    },
    autoUpdate() {
      return cloneWith(this, {
        isAutoUpdate: true,
        isReadOnly: true,
        hasDefault: true,
      });
    },
    check(sql: string) {
      return cloneWith(this, { check: sql });
    },
    min(n: number) {
      const sqlType = this._meta.sqlType;
      if (sqlType === 'text' || sqlType === 'varchar' || sqlType === 'bytea') {
        return cloneWith(this, { _minLength: n });
      }
      return cloneWith(this, { _minValue: n });
    },
    max(n: number) {
      const sqlType = this._meta.sqlType;
      if (sqlType === 'text' || sqlType === 'varchar' || sqlType === 'bytea') {
        return cloneWith(this, { _maxLength: n });
      }
      return cloneWith(this, { _maxValue: n });
    },
    regex(pattern: RegExp) {
      return cloneWith(this, { _regex: pattern });
    },
  };
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
  }) as unknown as ColumnBuilder<TType, TMeta>;
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
  }) as unknown as ColumnBuilder<number, SerialMeta>;
}
