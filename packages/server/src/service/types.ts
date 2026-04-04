import type { SchemaLike } from '@vertz/db';
import type { EntityOperations } from '../entity/entity-operations';
import type {
  AccessRule,
  BaseContext,
  ContextFeatures,
  EntityDefinition,
  FullFeatures,
} from '../entity/types';
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
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities — the correct default
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
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities — the correct default
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<
    string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint uses any to accept all action type parameter combinations
    ServiceActionDef<any, any, any>
  >,
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities — the correct default
  TInject extends Record<string, EntityDefinition> = {},
  TFeatures extends ContextFeatures = FullFeatures,
> {
  readonly inject?: TInject;
  readonly access?: Partial<Record<Extract<keyof NoInfer<TActions>, string>, AccessRule>>;
  readonly actions: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-erased ctx constraint in mapped type; concrete types flow through TIn/TOut
    readonly [K in keyof TActions]: TActions[K] extends ServiceActionDef<infer TIn, infer TOut, any>
      ? {
          readonly method?: string;
          readonly path?: string;
          readonly body?: SchemaLike<TIn>;
          readonly response: SchemaLike<TOut>;
          readonly handler: (
            input: TIn,
            ctx: BaseContext<TFeatures> & {
              readonly entities: InjectToOperations<TInject>;
              readonly request: ServiceRequestInfo;
            },
          ) => Promise<TOut | ResponseDescriptor<TOut>>;
        }
      : TActions[K];
  };
}

// ---------------------------------------------------------------------------
// ServiceDefinition — the frozen output of service()
// ---------------------------------------------------------------------------

export interface ServiceDefinition<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint uses any to accept all action type parameter combinations
  TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<
    string,
    ServiceActionDef
  >,
> {
  readonly kind: 'service';
  readonly name: string;
  readonly inject: Record<string, EntityDefinition>;
  readonly access: Partial<Record<string, AccessRule>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type-erased at runtime; concrete types preserved in __actions phantom
  readonly actions: Record<string, ServiceActionDef<any, any, any>>;
  /** @internal Phantom type — carries concrete action types for type extraction. Never accessed at runtime. */
  readonly __actions?: TActions;
}
