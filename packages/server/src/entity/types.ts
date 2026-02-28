import type { ModelDef, RelationDef, SchemaLike, TableDef } from '@vertz/db';
import type { EntityOperations } from './entity-operations';

// ---------------------------------------------------------------------------
// Inject map — maps local names to EntityDefinitions for typed cross-entity access
// ---------------------------------------------------------------------------

/** Extracts the model type from an EntityDefinition */
type ExtractModel<T> = T extends EntityDefinition<infer M> ? M : ModelDef;

/**
 * Maps an inject config `{ key: EntityDefinition<TModel> }` to
 * `{ key: EntityOperations<TModel> }` for typed ctx.entities access.
 */
// biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
type InjectToOperations<TInject extends Record<string, EntityDefinition> = {}> = {
  readonly [K in keyof TInject]: EntityOperations<ExtractModel<TInject[K]>>;
};

// ---------------------------------------------------------------------------
// EntityContext — the runtime context for access rules, hooks, and actions
// ---------------------------------------------------------------------------

export interface EntityContext<
  TModel extends ModelDef = ModelDef,
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> {
  readonly userId: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;

  /** Typed CRUD on the current entity */
  readonly entity: EntityOperations<TModel>;

  /** Typed access to injected entities only */
  readonly entities: InjectToOperations<TInject>;
}

// ---------------------------------------------------------------------------
// Access rules
// ---------------------------------------------------------------------------

export type AccessRule =
  | false
  | ((ctx: EntityContext, row: Record<string, unknown>) => boolean | Promise<boolean>);

// ---------------------------------------------------------------------------
// Before hooks — transform data before DB write
// ---------------------------------------------------------------------------

export interface EntityBeforeHooks<TCreateInput = unknown, TUpdateInput = unknown> {
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

export interface EntityAfterHooks<TResponse = unknown> {
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
  readonly input: SchemaLike<TInput>;
  readonly output: SchemaLike<TOutput>;
  readonly handler: (input: TInput, ctx: TCtx, row: TResponse) => Promise<TOutput>;
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

export type EntityRelationsConfig<
  TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
> = {
  [K in keyof TRelations]?: true | false | { [F in RelationColumnKeys<TRelations[K]>]?: true };
};

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
 * If the entity config narrows a relation to specific fields, the include
 * can request `true` (all allowed fields) or a subset of those fields.
 */
export type TypedIncludeOption<TRelationsConfig extends EntityRelationsConfig> = {
  [K in keyof TRelationsConfig as TRelationsConfig[K] extends false
    ? never
    : K]?: TRelationsConfig[K] extends Record<string, true>
    ? true | Partial<TRelationsConfig[K]>
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
  // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty actions record — the correct default for entities without custom actions
  TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> {
  readonly model: TModel;
  readonly inject?: TInject;
  readonly access?: Partial<
    Record<
      'list' | 'get' | 'create' | 'update' | 'delete' | Extract<keyof NoInfer<TActions>, string>,
      AccessRule
    >
  >;
  readonly before?: {
    readonly create?: (
      data: TModel['table']['$create_input'],
      ctx: EntityContext<TModel, TInject>,
    ) => TModel['table']['$create_input'] | Promise<TModel['table']['$create_input']>;
    readonly update?: (
      data: TModel['table']['$update_input'],
      ctx: EntityContext<TModel, TInject>,
    ) => TModel['table']['$update_input'] | Promise<TModel['table']['$update_input']>;
  };
  readonly after?: {
    readonly create?: (
      result: TModel['table']['$response'],
      ctx: EntityContext<TModel, TInject>,
    ) => void | Promise<void>;
    readonly update?: (
      prev: TModel['table']['$response'],
      next: TModel['table']['$response'],
      ctx: EntityContext<TModel, TInject>,
    ) => void | Promise<void>;
    readonly delete?: (
      row: TModel['table']['$response'],
      ctx: EntityContext<TModel, TInject>,
    ) => void | Promise<void>;
  };
  readonly actions?: { readonly [K in keyof TActions]: TActions[K] };
  readonly relations?: EntityRelationsConfig<TModel['relations']>;
}

// ---------------------------------------------------------------------------
// EntityDefinition — the frozen output of entity()
// ---------------------------------------------------------------------------

export interface EntityDefinition<TModel extends ModelDef = ModelDef> {
  readonly name: string;
  readonly model: TModel;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly before: EntityBeforeHooks;
  readonly after: EntityAfterHooks;
  readonly actions: Record<string, EntityActionDef>;
  readonly relations: EntityRelationsConfig<TModel['relations']>;
}
