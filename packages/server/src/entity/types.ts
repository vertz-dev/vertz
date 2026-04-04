import type { ModelDef, RelationDef, SchemaLike, TableDef } from '@vertz/db';
import type { AccessRule as AuthAccessRule } from '../auth/rules';
import type { ResponseDescriptor } from '../response';
import type { EntityOperations } from './entity-operations';
import type { TenantChain } from './tenant-chain';

// ---------------------------------------------------------------------------
// Inject map — maps local names to EntityDefinitions for typed cross-entity access
// ---------------------------------------------------------------------------

/** Extracts the model type from an EntityDefinition */
type ExtractModel<T> = T extends EntityDefinition<infer M> ? M : ModelDef;

/**
 * Maps an inject config `{ key: EntityDefinition<TModel> }` to
 * `{ key: EntityOperations<TModel> }` for typed ctx.entities access.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities — the correct default
type InjectToOperations<TInject extends Record<string, EntityDefinition> = {}> = {
  readonly [K in keyof TInject]: EntityOperations<ExtractModel<TInject[K]>>;
};

// ---------------------------------------------------------------------------
// Context feature flags — controls which fields BaseContext exposes
// ---------------------------------------------------------------------------

export interface ContextFeatures {
  auth: boolean;
  tenant: boolean;
  multiLevelTenant: boolean;
}

export type FullFeatures = { auth: true; tenant: true; multiLevelTenant: true };
export type NoFeatures = { auth: false; tenant: false; multiLevelTenant: false };

// ---------------------------------------------------------------------------
// Mixin interfaces — composed by BaseContext based on feature flags
// ---------------------------------------------------------------------------

/** Auth fields — present when ContextFeatures.auth is true. */
export interface AuthContext {
  readonly userId: string | null;
  authenticated(): boolean;
  role(...roles: string[]): boolean;
}

/** Tenant fields — present when ContextFeatures.tenant is true. */
export interface TenantContext {
  readonly tenantId: string | null;
  tenant(): boolean;
}

/** Multi-level tenant fields — present when ContextFeatures.multiLevelTenant is true. */
export interface MultiLevelTenantContext {
  readonly tenantLevel: string | null;
}

// ---------------------------------------------------------------------------
// BaseContext — shared by EntityContext and ServiceContext
// Conditional on ContextFeatures: only includes fields for enabled features.
// Defaults to FullFeatures for backwards compatibility.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} is the correct identity element for intersection when a feature is disabled
export type BaseContext<TFeatures extends ContextFeatures = FullFeatures> =
  (TFeatures['auth'] extends true ? AuthContext : {}) &
    (TFeatures['tenant'] extends true ? TenantContext : {}) &
    (TFeatures['multiLevelTenant'] extends true ? MultiLevelTenantContext : {});

// ---------------------------------------------------------------------------
// EntityContext — the runtime context for access rules, hooks, and actions
// ---------------------------------------------------------------------------

export interface EntityContext<
  TModel extends ModelDef = ModelDef,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> extends BaseContext {
  /** Typed CRUD on the current entity */
  readonly entity: EntityOperations<TModel>;

  /** Typed access to injected entities only */
  readonly entities: InjectToOperations<TInject>;
}

// ---------------------------------------------------------------------------
// Access rules
// ---------------------------------------------------------------------------

// AccessRule uses BaseContext (not EntityContext) because access rules are
// stored type-erased in definitions and checked at runtime where the
// inject map isn't available. Access rules shouldn't need cross-entity
// access — they check the current user/row only. Using BaseContext also
// allows actions to share the same AccessRule type.
export type AccessRule =
  | false
  | AuthAccessRule
  | ((ctx: BaseContext, row: Record<string, unknown>) => boolean | Promise<boolean>);

// ---------------------------------------------------------------------------
// Before hooks — transform data before DB write
// ---------------------------------------------------------------------------

interface EntityBeforeHooks<TCreateInput = unknown, TUpdateInput = unknown> {
  readonly create?: (
    data: TCreateInput,
    ctx: EntityContext,
  ) => TCreateInput | Promise<TCreateInput>;
  readonly update?: (
    data: TUpdateInput,
    ctx: EntityContext,
  ) => TUpdateInput | Promise<TUpdateInput>;
}

// ---------------------------------------------------------------------------
// After hooks — side effects after DB write (void return enforced)
// ---------------------------------------------------------------------------

interface EntityAfterHooks<TResponse = unknown> {
  readonly create?: (result: TResponse, ctx: EntityContext) => void | Promise<void>;
  readonly update?: (prev: TResponse, next: TResponse, ctx: EntityContext) => void | Promise<void>;
  readonly delete?: (row: TResponse, ctx: EntityContext) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Custom action definition
// ---------------------------------------------------------------------------

export interface EntityActionDef<
  TInput = unknown,
  TOutput = unknown,
  TResponse = unknown,
  TCtx extends EntityContext = EntityContext,
> {
  readonly method?: string;
  readonly path?: string;
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (
    input: TInput,
    ctx: TCtx,
    row: TResponse | null,
  ) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}

// ---------------------------------------------------------------------------
// Relations config
// ---------------------------------------------------------------------------

/** Extract column keys from a RelationDef's target table. */
type RelationColumnKeys<R> =
  R extends RelationDef<infer TTarget>
    ? TTarget extends TableDef<infer TCols>
      ? Extract<keyof TCols, string>
      : string
    : string;

/** Structured relation config with select, allowWhere, allowOrderBy, maxLimit. */
export interface RelationConfigObject<TColumnKeys extends string = string> {
  /** Which fields can be selected. Record<field, true>. */
  readonly select?: { readonly [F in TColumnKeys]?: true };
  /** Which fields can be filtered via `where`. */
  readonly allowWhere?: readonly string[];
  /** Which fields can be sorted via `orderBy`. */
  readonly allowOrderBy?: readonly string[];
  /** Max items per parent row. Defaults to DEFAULT_RELATION_LIMIT (100). */
  readonly maxLimit?: number;
}

export type EntityRelationsConfig<
  TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
> = {
  [K in keyof TRelations]?: true | false | RelationConfigObject<RelationColumnKeys<TRelations[K]>>;
};

// ---------------------------------------------------------------------------
// Expose config — controls what's exposed through the entity API
// ---------------------------------------------------------------------------

/** Extract the target table type from a RelationDef. */
type RelationTargetTable<R> = R extends RelationDef<infer T> ? T : TableDef;

/** Structured expose config for a relation. Controls field, filter, sort, and nested relation exposure. */
export interface RelationExposeConfig<R extends RelationDef = RelationDef> {
  /** Which fields of the related entity to expose. */
  readonly select: { [K in PublicColumnKeys<RelationTargetTable<R>>]?: true | AuthAccessRule };
  /** Which fields clients can filter on via VertzQL `where`. */
  readonly allowWhere?: { [K in PublicColumnKeys<RelationTargetTable<R>>]?: true | AuthAccessRule };
  /** Which fields clients can sort on via VertzQL `orderBy`. */
  readonly allowOrderBy?: {
    [K in PublicColumnKeys<RelationTargetTable<R>>]?: true | AuthAccessRule;
  };
  /** Max items returned per parent row. Defaults to DEFAULT_RELATION_LIMIT. */
  readonly maxLimit?: number;
  /** Nested relation exposure (loosely typed — target model relations not available from RelationDef). */
  readonly include?: Record<string, true | false | RelationExposeConfig>;
}

/** Controls which fields, filters, sorts, and relations are exposed through the entity API. */
export interface ExposeConfig<
  TTable extends TableDef = TableDef,
  TModel extends ModelDef = ModelDef,
> {
  /** Which fields of the entity to expose. Required when expose is present. */
  readonly select: { [K in PublicColumnKeys<TTable>]?: true | AuthAccessRule };
  /** Which fields clients can filter on via VertzQL `where`. */
  readonly allowWhere?: { [K in PublicColumnKeys<TTable>]?: true | AuthAccessRule };
  /** Which fields clients can sort on via VertzQL `orderBy`. */
  readonly allowOrderBy?: { [K in PublicColumnKeys<TTable>]?: true | AuthAccessRule };
  /** Which relations to expose and how. */
  readonly include?: {
    [K in keyof TModel['relations']]?:
      | true
      | false
      | RelationExposeConfig<
          TModel['relations'][K] extends RelationDef ? TModel['relations'][K] : RelationDef
        >;
  };
}

// ---------------------------------------------------------------------------
// Typed query options — SDK-facing types for VertzQL
// ---------------------------------------------------------------------------

/** Extract non-hidden column keys from a table (public fields). */
export type PublicColumnKeys<TTable extends TableDef> =
  TTable extends TableDef<infer TCols>
    ? {
        [K in keyof TCols & string]: TCols[K] extends { _meta: { _annotations: { hidden: true } } }
          ? never
          : K;
      }[keyof TCols & string]
    : string;

/**
 * Typed `select` option — only public (non-hidden) columns allowed.
 */
export type TypedSelectOption<TTable extends TableDef> = {
  [K in PublicColumnKeys<TTable>]?: true;
};

/**
 * Typed `where` option — only public (non-hidden) columns allowed.
 * Values are unknown because operators vary by column type.
 */
export type TypedWhereOption<TTable extends TableDef> = {
  [K in PublicColumnKeys<TTable>]?: unknown;
};

/**
 * Typed `include` option — constrained by entity relations config.
 *
 * If the entity config has a structured config with `select`, the include
 * can request `true` (all allowed fields) or an object with `select`,
 * `where`, `orderBy`, `limit`, and nested `include`.
 */
export type TypedIncludeOption<TRelationsConfig extends EntityRelationsConfig> = {
  [K in keyof TRelationsConfig as TRelationsConfig[K] extends false
    ? never
    : K]?: TRelationsConfig[K] extends RelationConfigObject
    ?
        | true
        | {
            select?: TRelationsConfig[K] extends { select: infer S } ? Partial<S> : undefined;
            where?: Record<string, unknown>;
            orderBy?: Record<string, 'asc' | 'desc'>;
            limit?: number;
          }
    : true;
};

/**
 * Full typed query options for an entity.
 * Used by SDK codegen to generate typed client methods.
 */
export interface TypedQueryOptions<
  TTable extends TableDef = TableDef,
  TRelationsConfig extends EntityRelationsConfig = EntityRelationsConfig,
> {
  where?: TypedWhereOption<TTable>;
  orderBy?: { [K in PublicColumnKeys<TTable>]?: 'asc' | 'desc' };
  limit?: number;
  after?: string;
  select?: TypedSelectOption<TTable>;
  include?: TypedIncludeOption<TRelationsConfig>;
}

// ---------------------------------------------------------------------------
// EntityConfig — what developers pass to entity()
// ---------------------------------------------------------------------------

export interface EntityConfig<
  TModel extends ModelDef = ModelDef,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents an empty actions record — the correct default for entities without custom actions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
  TFeatures extends ContextFeatures = FullFeatures,
> {
  readonly model: TModel;
  readonly inject?: TInject;
  /** Override the DB table name (defaults to entity name). For admin entities over shared tables. */
  readonly table?: string;
  /** Whether CRUD auto-filters by tenantId. Defaults to true when model has tenantId column. */
  readonly tenantScoped?: boolean;
  readonly access?: Partial<
    Record<
      'list' | 'get' | 'create' | 'update' | 'delete' | Extract<keyof NoInfer<TActions>, string>,
      AccessRule
    >
  >;
  readonly before?: {
    readonly create?: (
      data: TModel['table']['$create_input'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => TModel['table']['$create_input'] | Promise<TModel['table']['$create_input']>;
    readonly update?: (
      data: TModel['table']['$update_input'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => TModel['table']['$update_input'] | Promise<TModel['table']['$update_input']>;
  };
  readonly after?: {
    readonly create?: (
      result: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
    readonly update?: (
      prev: TModel['table']['$response'],
      next: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
    readonly delete?: (
      row: TModel['table']['$response'],
      ctx: BaseContext<TFeatures> & {
        readonly entity: EntityOperations<TModel>;
        readonly entities: InjectToOperations<TInject>;
      },
    ) => void | Promise<void>;
  };
  readonly actions?: { readonly [K in keyof TActions]: TActions[K] };
  readonly expose?: ExposeConfig<TModel['table'], TModel>;
}

// ---------------------------------------------------------------------------
// EntityDefinition — the frozen output of entity()
// ---------------------------------------------------------------------------

export interface EntityDefinition<
  TModel extends ModelDef = ModelDef,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint and default use any to accept all action type parameter combinations and ensure array compat
  TActions extends Record<string, EntityActionDef<any, any, any, any>> = Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any ensures EntityDefinition<TModel, SpecificActions> assignable to EntityDefinition[]
    EntityActionDef<any, any, any, any>
  >,
> {
  readonly kind: 'entity';
  readonly name: string;
  readonly model: TModel;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly before: EntityBeforeHooks;
  readonly after: EntityAfterHooks;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-erased at runtime; concrete types preserved in __actions phantom
  readonly actions: Record<string, EntityActionDef<any, any, any, any>>;
  readonly expose?: ExposeConfig<TModel['table'], TModel>;
  /** DB table name (defaults to entity name). */
  readonly table: string;
  /** Whether CRUD auto-filters by tenant column. */
  readonly tenantScoped: boolean;
  /** The tenant FK column name resolved from the model's tenant relation. Null when unscoped. */
  readonly tenantColumn: string | null;
  /** Relation chain for indirect tenant scoping. Null for direct or unscoped. */
  readonly tenantChain: TenantChain | null;
  /** @internal Phantom type — carries concrete action types for type extraction. Never accessed at runtime. */
  readonly __actions?: TActions;
}
