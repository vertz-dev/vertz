import type { SchemaLike } from '@vertz/db';
import type { EntityOperations } from '../entity/entity-operations';
import type { AccessRule, BaseContext, EntityDefinition } from '../entity/types';

// ---------------------------------------------------------------------------
// Inject map — maps local names to EntityDefinitions for typed cross-entity access
// ---------------------------------------------------------------------------

/** Extracts the model type from an EntityDefinition */
type ExtractModel<T> = T extends EntityDefinition<infer M> ? M : never;

/**
 * Maps an inject config `{ key: EntityDefinition<TModel> }` to
 * `{ key: EntityOperations<TModel> }` for typed ctx.entities access.
 */
// biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
type InjectToOperations<TInject extends Record<string, EntityDefinition> = {}> = {
  readonly [K in keyof TInject]: EntityOperations<ExtractModel<TInject[K]>>;
};

// ---------------------------------------------------------------------------
// ActionContext — runtime context for action handlers
// ---------------------------------------------------------------------------

export interface ActionContext<
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> extends BaseContext {
  /** Typed access to injected entities only */
  readonly entities: InjectToOperations<TInject>;
}

// ---------------------------------------------------------------------------
// ActionActionDef — definition of a single handler within an action group
// ---------------------------------------------------------------------------

export interface ActionActionDef<
  TInput = unknown,
  TOutput = unknown,
  TCtx extends ActionContext = ActionContext,
> {
  readonly method?: string;
  readonly path?: string;
  readonly body: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (input: TInput, ctx: TCtx) => Promise<TOutput>;
}

// ---------------------------------------------------------------------------
// ActionConfig — what developers pass to action()
// ---------------------------------------------------------------------------

export interface ActionConfig<
  // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ActionActionDef<any, any, any>> = Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
    ActionActionDef<any, any, any>
  >,
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> {
  readonly inject?: TInject;
  readonly access?: Partial<Record<Extract<keyof NoInfer<TActions>, string>, AccessRule>>;
  readonly actions: { readonly [K in keyof TActions]: TActions[K] };
}

// ---------------------------------------------------------------------------
// ActionDefinition — the frozen output of action()
// ---------------------------------------------------------------------------

export interface ActionDefinition {
  readonly kind: 'action';
  readonly name: string;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly actions: Record<string, ActionActionDef>;
}
