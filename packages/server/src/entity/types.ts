import type { ModelDef, RelationDef, SchemaLike } from '@vertz/db';
import type { EntityOperations } from './entity-operations';

// ---------------------------------------------------------------------------
// EntityContext — the runtime context for access rules, hooks, and actions
// ---------------------------------------------------------------------------

export interface EntityContext<TModel extends ModelDef = ModelDef> {
  readonly userId: string | null;
  authenticated(): boolean;
  tenant(): boolean;
  role(...roles: string[]): boolean;

  /** Typed CRUD on the current entity */
  readonly entity: EntityOperations<TModel>;

  /** Loosely-typed access to all registered entities */
  readonly entities: Record<string, EntityOperations>;
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

export interface EntityActionDef<TInput = unknown, TOutput = unknown, TResponse = unknown> {
  readonly input: SchemaLike<TInput>;
  readonly output: SchemaLike<TOutput>;
  readonly handler: (input: TInput, ctx: EntityContext, row: TResponse) => Promise<TOutput>;
}

// ---------------------------------------------------------------------------
// Relations config
// ---------------------------------------------------------------------------

export type EntityRelationsConfig<
  TRelations extends Record<string, RelationDef> = Record<string, RelationDef>,
> = {
  [K in keyof TRelations]?: true | false | Record<string, true>;
};

// ---------------------------------------------------------------------------
// EntityConfig — what developers pass to entity()
// ---------------------------------------------------------------------------

export interface EntityConfig<
  TModel extends ModelDef = ModelDef,
  // biome-ignore lint/complexity/noBannedTypes: {} represents an empty actions record — the correct default for entities without custom actions
  TActions extends Record<string, EntityActionDef> = {},
> {
  readonly model: TModel;
  readonly access?: Partial<
    Record<
      'list' | 'get' | 'create' | 'update' | 'delete' | Extract<keyof TActions, string>,
      AccessRule
    >
  >;
  readonly before?: EntityBeforeHooks<
    TModel['table']['$create_input'],
    TModel['table']['$update_input']
  >;
  readonly after?: EntityAfterHooks<TModel['table']['$response']>;
  readonly actions?: TActions;
  readonly relations?: EntityRelationsConfig<TModel['relations']>;
}

// ---------------------------------------------------------------------------
// EntityDefinition — the frozen output of entity()
// ---------------------------------------------------------------------------

export interface EntityDefinition<TModel extends ModelDef = ModelDef> {
  readonly name: string;
  readonly model: TModel;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly before: EntityBeforeHooks<
    TModel['table']['$create_input'],
    TModel['table']['$update_input']
  >;
  readonly after: EntityAfterHooks<TModel['table']['$response']>;
  readonly actions: Record<string, EntityActionDef>;
  readonly relations: EntityRelationsConfig<TModel['relations']>;
}
