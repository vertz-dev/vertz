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
  readonly references: { readonly table: string; readonly column: string } | null;
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
    Omit<TMeta, 'primary' | 'hasDefault'> & { readonly primary: true; readonly hasDefault: true }
  >;
  unique(): ColumnBuilder<TType, Omit<TMeta, 'unique'> & { readonly unique: true }>;
  nullable(): ColumnBuilder<TType | null, Omit<TMeta, 'nullable'> & { readonly nullable: true }>;
  default(
    value: TType | 'now',
  ): ColumnBuilder<
    TType,
    Omit<TMeta, 'hasDefault'> & { readonly hasDefault: true; readonly defaultValue: TType | 'now' }
  >;
  sensitive(): ColumnBuilder<TType, Omit<TMeta, 'sensitive'> & { readonly sensitive: true }>;
  hidden(): ColumnBuilder<TType, Omit<TMeta, 'hidden'> & { readonly hidden: true }>;
  check(sql: string): ColumnBuilder<TType, Omit<TMeta, 'check'> & { readonly check: string }>;
  references(
    table: string,
    column?: string,
  ): ColumnBuilder<
    TType,
    Omit<TMeta, 'references'> & {
      readonly references: { readonly table: string; readonly column: string };
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
  readonly references: null;
  readonly check: null;
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
    primary() {
      return cloneWith(this, { primary: true, hasDefault: true }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['primary']
      >;
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
    sensitive() {
      return cloneWith(this, { sensitive: true }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['sensitive']
      >;
    },
    hidden() {
      return cloneWith(this, { hidden: true }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['hidden']
      >;
    },
    check(sql: string) {
      return cloneWith(this, { check: sql }) as ReturnType<
        ColumnBuilder<unknown, ColumnMetadata>['check']
      >;
    },
    references(table: string, column?: string) {
      return cloneWith(this, {
        references: { table, column: column ?? 'id' },
      }) as ReturnType<ColumnBuilder<unknown, ColumnMetadata>['references']>;
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
    sensitive: false,
    hidden: false,
    references: null,
    check: null,
  };
}

export function createColumn<TType, TSqlType extends string>(
  sqlType: TSqlType,
  extra?: Record<string, unknown>,
): ColumnBuilder<TType, DefaultMeta<TSqlType>> {
  return createColumnWithMeta({
    ...defaultMeta(sqlType),
    ...extra,
  }) as ColumnBuilder<TType, DefaultMeta<TSqlType>>;
}

export type SerialMeta = {
  readonly sqlType: 'serial';
  readonly primary: false;
  readonly unique: false;
  readonly nullable: false;
  readonly hasDefault: true;
  readonly sensitive: false;
  readonly hidden: false;
  readonly references: null;
  readonly check: null;
};

export function createSerialColumn(): ColumnBuilder<number, SerialMeta> {
  return createColumnWithMeta({
    sqlType: 'serial',
    primary: false,
    unique: false,
    nullable: false,
    hasDefault: true,
    sensitive: false,
    hidden: false,
    references: null,
    check: null,
  }) as ColumnBuilder<number, SerialMeta>;
}
