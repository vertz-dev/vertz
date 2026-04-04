import type { ModelDef } from '@vertz/db';
import type { AuthConfig } from './auth/types';
import type { CloudServerConfig } from './create-server';
import type {
  BaseContext,
  ContextFeatures,
  EntityActionDef,
  EntityConfig,
  EntityDefinition,
  FullFeatures,
  NoFeatures,
} from './entity/types';
import { entity } from './entity/entity';
import type { ServiceActionDef, ServiceConfig, ServiceDefinition } from './service/types';
import { service } from './service/service';

// ---------------------------------------------------------------------------
// InferFeatures — derives ContextFeatures from an auth config shape
// ---------------------------------------------------------------------------

/**
 * Infers ContextFeatures from the auth config type.
 * - No auth (`undefined`) → all false
 * - Auth only → `{ auth: true; tenant: false; multiLevelTenant: false }`
 * - Auth + tenant → `{ auth: true; tenant: true; multiLevelTenant: false }`
 * - Auth + multi-level tenant → `{ auth: true; tenant: true; multiLevelTenant: true }`
 *
 * Uses structural checks to avoid matching `tenant: false`.
 */
export type InferFeatures<TAuth> = {
  auth: TAuth extends AuthConfig ? true : false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any[] in function signature is required for structural matching of verifyMembership
  tenant: TAuth extends { tenant: { verifyMembership: (...args: any[]) => any } } ? true : false;
  multiLevelTenant: TAuth extends { tenant: { multiLevel: true } } ? true : false;
};

// ---------------------------------------------------------------------------
// TypedFactories — entity/service with narrowed TFeatures
// ---------------------------------------------------------------------------

export interface TypedFactories<F extends ContextFeatures> {
  entity: <
    TModel extends ModelDef,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities
    TInject extends Record<string, EntityDefinition> = {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type -- constraint uses any to accept all action type parameter combinations; {} represents an empty actions record
    TActions extends Record<string, EntityActionDef<any, any, any, any>> = {},
  >(
    name: string,
    config: EntityConfig<TModel, TActions, TInject, F>,
  ) => EntityDefinition<TModel, TActions>;

  service: <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- constraint uses any to accept all action type parameter combinations
    TActions extends Record<string, ServiceActionDef<any, any, any>> = Record<
      string,
      ServiceActionDef
    >,
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} represents no injected entities
    TInject extends Record<string, EntityDefinition> = {},
  >(
    name: string,
    config: ServiceConfig<TActions, TInject, F>,
  ) => ServiceDefinition<TActions>;
}

// ---------------------------------------------------------------------------
// typed() — runtime no-op, type-level narrowing
// ---------------------------------------------------------------------------

/**
 * Returns narrowed `entity()` and `service()` factory functions.
 * The auth config parameter is only used for type inference — at runtime,
 * `typed()` simply returns `{ entity, service }` unchanged.
 *
 * @example
 * ```ts
 * const auth = defineAuth({ session: { strategy: 'jwt', ttl: '1h' } });
 * const { entity, service } = typed(auth);
 * // entity() hooks now only have auth fields on ctx (no tenant)
 * ```
 */
export function typed<TAuth extends AuthConfig | undefined>(
  _auth?: TAuth,
): TypedFactories<InferFeatures<TAuth>> {
  return { entity, service } as TypedFactories<InferFeatures<TAuth>>;
}

// ---------------------------------------------------------------------------
// InferServerFeatures — derives ContextFeatures from a server config shape
// ---------------------------------------------------------------------------

/**
 * Infers ContextFeatures from a ServerConfig-like object.
 * - Config with `auth` → infers from auth config
 * - Config with `cloud` → FullFeatures (cloud always has auth + tenant)
 * - Neither → NoFeatures
 */
export type InferServerFeatures<TConfig> = TConfig extends { auth: infer A }
  ? InferFeatures<A>
  : TConfig extends { cloud: CloudServerConfig }
    ? FullFeatures
    : NoFeatures;

/**
 * Derives the BaseContext type from a ServerConfig-like object.
 */
export type InferServerContext<TConfig> = BaseContext<InferServerFeatures<TConfig>>;
