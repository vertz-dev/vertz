import type { SchemaLike } from '@vertz/db';
import type { EntityOperations } from '../entity/entity-operations';
import type { AccessRule, BaseContext, EntityDefinition } from '../entity/types';
import type { ResponseDescriptor } from '../response';

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
// ServiceContext — runtime context for service handlers
// ---------------------------------------------------------------------------

/** Raw request metadata exposed to service handlers */
export interface ServiceRequestInfo {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: unknown;
  readonly params: Record<string, string>;
}

export interface ServiceContext<
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> extends BaseContext {
  /** Typed access to injected entities only */
  readonly entities: InjectToOperations<TInject>;
  /** Raw request metadata — URL, method, headers, pre-parsed body */
  readonly request: ServiceRequestInfo;
}

// ---------------------------------------------------------------------------
// ServiceActionDef — definition of a single handler within a service
// ---------------------------------------------------------------------------

export interface ServiceActionDef<
  TInput = unknown,
  TOutput = unknown,
  TCtx extends ServiceContext = ServiceContext,
> {
  readonly method?: string;
  readonly path?: string;
  readonly body?: SchemaLike<TInput>;
  readonly response: SchemaLike<TOutput>;
  readonly handler: (input: TInput, ctx: TCtx) => Promise<TOutput | ResponseDescriptor<TOutput>>;
}

// ---------------------------------------------------------------------------
// ServiceConfig — what developers pass to service()
// ---------------------------------------------------------------------------

export interface ServiceConfig<
  // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
    ServiceActionDef<any, any, any>
  >,
  // biome-ignore lint/complexity/noBannedTypes: {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
> {
  readonly inject?: TInject;
  readonly access?: Partial<Record<Extract<keyof NoInfer<TActions>, string>, AccessRule>>;
  readonly actions: { readonly [K in keyof TActions]: TActions[K] };
}

// ---------------------------------------------------------------------------
// ServiceDefinition — the frozen output of service()
// ---------------------------------------------------------------------------

export interface ServiceDefinition<
  // biome-ignore lint/suspicious/noExplicitAny: constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<
    string,
    ServiceActionDef
  >,
> {
  readonly kind: 'service';
  readonly name: string;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  readonly actions: Record<string, ServiceActionDef>;
  /** @internal Phantom type — carries concrete action types for type extraction. Never accessed at runtime. */
  readonly __actions?: TActions;
}
