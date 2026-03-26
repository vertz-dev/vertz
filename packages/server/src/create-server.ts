import type { AppBuilder, AppConfig, EntityRouteEntry } from '@vertz/core';
import { createServer as coreCreateServer } from '@vertz/core';
import { type ResolvedMiddleware, runMiddlewareChain } from '@vertz/core/internals';
import {
  createDatabaseBridgeAdapter,
  type DatabaseClient,
  type DatabaseInternals,
  type EntityDbAdapter,
  type ModelEntry,
} from '@vertz/db';
import { initializeAuthTables, validateAuthModels } from './auth/auth-tables';
import { createCloudJWTVerifier } from './auth/cloud-jwt-verifier';
import { createAuthProxy } from './auth/cloud-proxy';
import { resolveCloudAuthContext, validateProjectId } from './auth/cloud-startup';
import { DbClosureStore } from './auth/db-closure-store';
import { DbOAuthAccountStore } from './auth/db-oauth-account-store';
import { DbRoleAssignmentStore } from './auth/db-role-assignment-store';
import { DbSessionStore } from './auth/db-session-store';
import type { AuthDbClient } from './auth/db-types';
import { DbUserStore } from './auth/db-user-store';
import { createAuth } from './auth/index';
import { createJWKSClient } from './auth/jwks-client';
import { resolveSessionForSSR as createSSRResolver } from './auth/resolve-session-for-ssr';
import { createAuthSessionMiddleware } from './auth/session-middleware';
import type { AuthConfig, AuthInstance } from './auth/types';
import type { DomainDefinition } from './domain/types';
import type { EntityOperations } from './entity/entity-operations';
import { EntityRegistry } from './entity/entity-registry';
import { stripHiddenFields } from './entity/field-filter';
import { generateEntityRoutes } from './entity/route-generator';
import { resolveTenantChain } from './entity/tenant-chain';
import type { EntityDefinition } from './entity/types';
import { generateServiceRoutes } from './service/route-generator';
import type { ServiceDefinition } from './service/types';

// ---------------------------------------------------------------------------
// DatabaseClient detection
// ---------------------------------------------------------------------------

/**
 * Structural match for any DatabaseClient regardless of model types.
 *
 * DatabaseClient's mapped type `{ [K in keyof TModels]: ModelDelegate<TModels[K]> }`
 * is invariant in TModels, which prevents `DatabaseClient<{ todos: ModelDef<...> }>`
 * from being assignable to `DatabaseClient<Record<string, ModelEntry>>`.
 * This interface captures only what createServer actually accesses.
 */
interface DatabaseClientLike {
  readonly _internals: DatabaseInternals<Record<string, ModelEntry>>;
  [key: string]: unknown;
}

/**
 * Detects whether the provided db object is a DatabaseClient (query builder)
 * rather than a plain EntityDbAdapter.
 *
 * A DatabaseClient has `_internals` with `models` and `dialect` properties
 * that an EntityDbAdapter does not.
 */
function isDatabaseClient(db: DatabaseClientLike | EntityDbAdapter): db is DatabaseClientLike {
  return db !== null && typeof db === 'object' && '_internals' in db;
}

// ---------------------------------------------------------------------------
// ServerInstance — extended return type when db + auth are provided
// ---------------------------------------------------------------------------

export interface ServerInstance extends AppBuilder {
  auth: AuthInstance;
  initialize(): Promise<void>;
  /** Routes auth requests (/api/auth/*) to auth.handler, everything else to entity handler */
  readonly requestHandler: (request: Request) => Promise<Response>;
}

// ---------------------------------------------------------------------------
// Extended config for @vertz/server's createServer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Cloud config for cloud-managed auth
// ---------------------------------------------------------------------------

export interface CloudServerConfig {
  /** Cloud project ID (e.g., "proj_abc123") */
  projectId: string;
  /** Cloud base URL — defaults to "https://cloud.vtz.app" */
  cloudBaseUrl?: string;
}

// ---------------------------------------------------------------------------
// Extended config for @vertz/server's createServer
// ---------------------------------------------------------------------------

export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory' | 'entities'> {
  /** Entity definitions created via entity() from @vertz/server */
  entities?: EntityDefinition[];
  /** Standalone service definitions created via service() from @vertz/server */
  services?: ServiceDefinition[];
  /** Domain definitions created via domain() from @vertz/server */
  domains?: DomainDefinition[];
  /**
   * Database for entity CRUD operations.
   * Accepts either:
   * - A DatabaseClient from createDb() (recommended — auto-bridged per entity)
   * - An EntityDbAdapter (deprecated — simple adapter with get/list/create/update/delete)
   */
  db?: DatabaseClientLike | EntityDbAdapter;
  /** @internal Factory to create a DB adapter for each entity. Prefer `db` instead. */
  _entityDbFactory?: (entityDef: EntityDefinition) => EntityDbAdapter;
  /** @internal Resolves parent IDs for indirect tenant chain traversal. For testing only. */
  _queryParentIds?: import('./entity/crud-pipeline').QueryParentIdsFn;
  /** @internal Tenant chains for indirect scoping. For testing without DatabaseClient. */
  _tenantChains?: Map<string, import('./entity/tenant-chain').TenantChain>;
  /** Auth configuration — when combined with db, auto-wires DB-backed stores */
  auth?: AuthConfig;
  /** Cloud-managed auth — when set, auth is handled by Vertz Cloud proxy */
  cloud?: CloudServerConfig;
}

// ---------------------------------------------------------------------------
// queryParentIds factory — resolves SQL table names to registry keys
// ---------------------------------------------------------------------------

/** @internal Exported for testing only. */
export function createQueryParentIds(
  dbClient: Record<string, unknown>,
  tableNameToModelKey: Map<string, string>,
): (sqlTableName: string, where: Record<string, unknown>) => Promise<string[]> {
  return async (sqlTableName, where) => {
    const registryKey = tableNameToModelKey.get(sqlTableName);
    if (!registryKey) return [];
    const delegate = dbClient[registryKey] as
      | { list: (opts: never) => Promise<{ ok: boolean; data?: unknown[] }> }
      | undefined;
    if (!delegate) return [];
    const result = await delegate.list({ where } as never);
    if (!result.ok || !result.data) return [];
    return (result.data as Record<string, unknown>[]).map((row) => row.id as string);
  };
}

// ---------------------------------------------------------------------------
// Default in-memory DB adapter (placeholder — real DB adapter comes from @vertz/db)
// ---------------------------------------------------------------------------

function createNoopDbAdapter(): EntityDbAdapter {
  return {
    async get() {
      return null;
    },
    async list() {
      return { data: [], total: 0 };
    },
    async create(data) {
      return data;
    },
    async update(_id, data) {
      return data;
    },
    async delete() {
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Entity operations wrapper — adapts EntityDbAdapter to EntityOperations
// ---------------------------------------------------------------------------

/**
 * Wraps an EntityDbAdapter to produce an EntityOperations facade for the registry.
 * This enables cross-entity and action DI — `ctx.entities.xxx` calls go through these ops.
 */
function createEntityOps(entityDef: EntityDefinition, db: EntityDbAdapter): EntityOperations {
  const table = entityDef.model.table;
  return {
    async get(id: string) {
      const row = await db.get(id);
      if (!row)
        return row as EntityOperations['get'] extends (...args: unknown[]) => Promise<infer R>
          ? R
          : never;
      return stripHiddenFields(table, row as Record<string, unknown>);
    },
    async list(options?) {
      const result = await db.list(options);
      const items = Array.isArray(result) ? result : (result.data ?? []);
      const total = Array.isArray(result) ? result.length : (result.total ?? items.length);
      return {
        items: items.map((row) => stripHiddenFields(table, row as Record<string, unknown>)),
        total,
        limit: options?.limit ?? 20,
        nextCursor: null,
        hasNextPage: false,
      };
    },
    async create(data) {
      const row = await db.create(data as Record<string, unknown>);
      return stripHiddenFields(table, row as Record<string, unknown>);
    },
    async update(id: string, data) {
      const row = await db.update(id, data as Record<string, unknown>);
      return stripHiddenFields(table, row as Record<string, unknown>);
    },
    async delete(id: string) {
      await db.delete(id);
    },
  } as EntityOperations;
}

// ---------------------------------------------------------------------------
// createServer wrapper
// ---------------------------------------------------------------------------

/**
 * Creates an HTTP server with entity route generation.
 * Wraps @vertz/core's createServer to inject entity CRUD handlers.
 *
 * When both `db` (DatabaseClient) and `auth` are provided:
 * - Validates auth models are registered in the DatabaseClient
 * - Auto-wires DB-backed UserStore and SessionStore
 * - Returns ServerInstance with `.auth` and `.initialize()`
 */
export function createServer(
  config: ServerConfig & { db: DatabaseClientLike; auth: AuthConfig },
): ServerInstance;
export function createServer(config: ServerConfig & { cloud: CloudServerConfig }): ServerInstance;
export function createServer(config: ServerConfig): AppBuilder;
export function createServer(config: ServerConfig): AppBuilder | ServerInstance {
  const allRoutes: EntityRouteEntry[] = [];
  const registry = new EntityRegistry();
  const apiPrefix = config.apiPrefix === undefined ? '/api' : config.apiPrefix;
  const { db } = config;
  const hasDbClient = db && isDatabaseClient(db);

  // ---------------------------------------------------------------------------
  // Flatten domains into entities + services arrays
  // ---------------------------------------------------------------------------
  const entityDomainMap = new Map<string, string>();
  const serviceDomainMap = new Map<string, string>();

  if (config.domains && config.domains.length > 0) {
    const seenDomainNames = new Set<string>();
    const topLevelEntityNames = new Set((config.entities ?? []).map((e) => e.name));
    const topLevelServiceNames = new Set((config.services ?? []).map((s) => s.name));

    const flattenedEntities: EntityDefinition[] = [...(config.entities ?? [])];
    const flattenedServices: ServiceDefinition[] = [...(config.services ?? [])];

    for (const domainDef of config.domains) {
      // Validate unique domain names
      if (seenDomainNames.has(domainDef.name)) {
        throw new Error(`Duplicate domain name "${domainDef.name}".`);
      }
      seenDomainNames.add(domainDef.name);

      // Validate domain name doesn't collide with top-level entity/service names
      if (topLevelEntityNames.has(domainDef.name)) {
        throw new Error(
          `Domain name "${domainDef.name}" conflicts with top-level entity "${domainDef.name}". ` +
            'Route paths would be ambiguous.',
        );
      }
      if (topLevelServiceNames.has(domainDef.name)) {
        throw new Error(
          `Domain name "${domainDef.name}" conflicts with top-level service "${domainDef.name}". ` +
            'Route paths would be ambiguous.',
        );
      }

      // Flatten domain entities
      for (const entityDef of domainDef.entities) {
        // Check for duplicate entity names across domains
        const existingDomain = entityDomainMap.get(entityDef.name);
        if (existingDomain) {
          throw new Error(
            `Entity "${entityDef.name}" appears in both domain "${existingDomain}" and domain "${domainDef.name}".`,
          );
        }
        if (topLevelEntityNames.has(entityDef.name)) {
          throw new Error(
            `Entity "${entityDef.name}" appears in both domain "${domainDef.name}" and top-level entities.`,
          );
        }
        entityDomainMap.set(entityDef.name, domainDef.name);
        flattenedEntities.push(entityDef);
      }

      // Flatten domain services
      for (const serviceDef of domainDef.services) {
        const existingServiceDomain = serviceDomainMap.get(serviceDef.name);
        if (existingServiceDomain) {
          throw new Error(
            `Service "${serviceDef.name}" appears in both domain "${existingServiceDomain}" and domain "${domainDef.name}".`,
          );
        }
        if (topLevelServiceNames.has(serviceDef.name)) {
          throw new Error(
            `Service "${serviceDef.name}" appears in both domain "${domainDef.name}" and top-level services.`,
          );
        }
        serviceDomainMap.set(serviceDef.name, domainDef.name);
        flattenedServices.push(serviceDef);
      }
    }

    config = { ...config, entities: flattenedEntities, services: flattenedServices };
  }

  // Resolve domain middleware: NamedMiddlewareDef[] → ResolvedMiddleware[] per domain
  const domainMiddlewareMap = new Map<string, ResolvedMiddleware[]>();
  if (config.domains) {
    for (const domainDef of config.domains) {
      if (domainDef.middleware.length > 0) {
        const resolved: ResolvedMiddleware[] = domainDef.middleware.map((mw) => ({
          name: mw.name,
          handler: mw.handler,
          resolvedInject: {},
        }));
        domainMiddlewareMap.set(domainDef.name, resolved);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Auth model validation — when both db (DatabaseClient) and auth are provided
  // ---------------------------------------------------------------------------
  if (hasDbClient && config.auth) {
    validateAuthModels(db as unknown as AuthDbClient);
  }

  // Tenant resource type derived from tenant graph + access definition (set during entity processing)
  let tenantResourceType: string | undefined;
  // Access config for CRUD pipeline, hoisted for reuse in auth wiring
  let crudAccessConfig: import('./entity/crud-pipeline').CrudAccessConfig | undefined;

  // Resolve tenant levels for closure auto-population + multi-level auth
  const resolvedTenantLevels = hasDbClient
    ? (db as DatabaseClient<Record<string, ModelEntry>>)._internals.tenantGraph.levels
    : undefined;

  // Process entities first (so registry has all entities registered for DI)
  if (config.entities && config.entities.length > 0) {
    let dbFactory: (entityDef: EntityDefinition) => EntityDbAdapter;

    // Build reverse lookup: SQL table name → model registry key (used by validation,
    // bridge adapter, tenant chain resolution, and queryParentIds)
    const tableNameToModelKey = new Map<string, string>();
    if (hasDbClient) {
      const dbModels = (db as DatabaseClient<Record<string, ModelEntry>>)._internals.models;
      for (const [key, entry] of Object.entries(dbModels)) {
        tableNameToModelKey.set(entry.table._name, key);
      }

      // Validate all entity models are registered in the DatabaseClient (by table._name)
      const missing = config.entities
        .filter((e) => !tableNameToModelKey.has((e as EntityDefinition).model.table._name))
        .map((e) => {
          const eDef = e as EntityDefinition;
          return `Entity "${eDef.name}" references table "${eDef.model.table._name}"`;
        });
      // Deduplicate (multiple entities can share a table)
      const uniqueMissing = [...new Set(missing)];
      if (uniqueMissing.length > 0) {
        const registeredTables = [...tableNameToModelKey.keys()].map((t) => `"${t}"`).join(', ');
        const plural = uniqueMissing.length > 1;
        throw new Error(
          `${uniqueMissing.join('; ')} — not registered in createDb(). ` +
            `Add the missing model${plural ? 's' : ''} to the models object in your createDb() call. ` +
            `Registered tables: ${registeredTables || '(none)'}`,
        );
      }

      dbFactory = (entityDef) => {
        const modelKey = tableNameToModelKey.get(entityDef.model.table._name)!;
        return createDatabaseBridgeAdapter(
          db as DatabaseClient<Record<string, ModelEntry>>,
          modelKey,
        );
      };
    } else if (db) {
      dbFactory = () => db as EntityDbAdapter;
    } else {
      dbFactory = config._entityDbFactory ?? createNoopDbAdapter;
    }

    // Resolve tenant chains for indirectly scoped entities (when using DatabaseClient)
    const tenantChains = new Map<string, import('./entity/tenant-chain').TenantChain>();
    let queryParentIds: import('./entity/crud-pipeline').QueryParentIdsFn | undefined;
    if (hasDbClient) {
      const dbClient = db as DatabaseClient<Record<string, ModelEntry>>;
      const tenantGraph = dbClient._internals.tenantGraph;
      const dbModelsMap = dbClient._internals.models;
      for (const entityDef of config.entities) {
        const eDef = entityDef as EntityDefinition;
        // Skip entities that explicitly opt out
        if (eDef.tenantScoped === false) continue;
        const modelKey = tableNameToModelKey.get(eDef.model.table._name)!;
        const chain = resolveTenantChain(modelKey, tenantGraph, dbModelsMap);
        if (chain) {
          tenantChains.set(eDef.name, chain);
        }
      }

      // Create queryParentIds from the DatabaseClient for indirect tenant chain traversal
      if (tenantChains.size > 0) {
        queryParentIds = createQueryParentIds(
          dbClient as Record<string, unknown>,
          tableNameToModelKey,
        );
      }
    }

    // Merge pre-computed tenant chains (for testing without DatabaseClient)
    if (config._tenantChains) {
      for (const [name, chain] of config._tenantChains) {
        tenantChains.set(name, chain);
      }
    }

    // Register entity operations into the registry first (for cross-entity DI)
    for (const entityDef of config.entities) {
      const entityDb = dbFactory(entityDef as EntityDefinition);
      const ops = createEntityOps(entityDef as EntityDefinition, entityDb);
      registry.register(entityDef.name, ops);
    }

    // Compute access config for entity CRUD pipeline (enables rules.entitlement() evaluation).
    // Auto-wire roleStore and closureStore from DB when not explicitly provided.
    const authDb = hasDbClient ? (db as unknown as AuthDbClient) : undefined;
    const resolvedRoleStore =
      config.auth?.access?.roleStore ?? (authDb && new DbRoleAssignmentStore(authDb));
    const resolvedClosureStore =
      config.auth?.access?.closureStore ?? (authDb && new DbClosureStore(authDb));
    if (config.auth?.access && resolvedRoleStore && resolvedClosureStore) {
      crudAccessConfig = {
        definition: config.auth.access.definition,
        roleStore: resolvedRoleStore,
        closureStore: resolvedClosureStore,
        flagStore: config.auth.access.flagStore,
        subscriptionStore: config.auth.access.subscriptionStore,
      };
    }

    // Derive tenant resource type from tenant graph root + access definition entity names
    if (hasDbClient && crudAccessConfig) {
      const dbClient = db as DatabaseClient<Record<string, ModelEntry>>;
      const tenantRoot = dbClient._internals.tenantGraph.root; // e.g. 'workspaces'
      if (tenantRoot) {
        const accessEntityNames = Object.keys(crudAccessConfig.definition.roles);
        // Match: access entity 'workspace' → table name 'workspaces' (entity + 's')
        tenantResourceType = accessEntityNames.find(
          (name) => name === tenantRoot || `${name}s` === tenantRoot,
        );
      }
    }

    // Resolve tenant levels for closure auto-population
    const resolvedTenantLevels = hasDbClient
      ? (db as DatabaseClient<Record<string, ModelEntry>>)._internals.tenantGraph.levels
      : undefined;

    // Generate routes for each entity
    for (const entityDef of config.entities) {
      const entityDb = dbFactory(entityDef as EntityDefinition);
      const tenantChain = tenantChains.get(entityDef.name) ?? null;
      const domainName = entityDomainMap.get(entityDef.name);
      const entityApiPrefix = domainName ? `${apiPrefix}/${domainName}` : apiPrefix;
      const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, entityDb, {
        apiPrefix: entityApiPrefix,
        tenantChain,
        queryParentIds: tenantChain ? (queryParentIds ?? config._queryParentIds) : undefined,
        accessConfig: crudAccessConfig,
        tenantResourceType,
        closureStore: resolvedClosureStore ?? undefined,
        tenantLevels: resolvedTenantLevels,
      });
      // Wrap handlers with domain middleware
      const domainMw = domainName ? domainMiddlewareMap.get(domainName) : undefined;
      if (domainMw) {
        for (const route of routes) {
          const originalHandler = route.handler;
          const mw = domainMw;
          route.handler = async (ctx: Record<string, unknown>) => {
            const mwState = await runMiddlewareChain(mw, ctx);
            if (Object.keys(mwState).length === 0) return originalHandler(ctx);
            return originalHandler({ ...ctx, ...mwState });
          };
        }
      }
      allRoutes.push(...routes);
    }
  }

  // Process services after entities (services use registry for entity DI)
  if (config.services && config.services.length > 0) {
    for (const serviceDef of config.services) {
      const domainName = serviceDomainMap.get(serviceDef.name);
      const serviceApiPrefix = domainName ? `${apiPrefix}/${domainName}` : apiPrefix;
      const routes = generateServiceRoutes(serviceDef, registry, { apiPrefix: serviceApiPrefix });
      // Wrap handlers with domain middleware
      const domainMw = domainName ? domainMiddlewareMap.get(domainName) : undefined;
      if (domainMw) {
        for (const route of routes) {
          const originalHandler = route.handler;
          const mw = domainMw;
          route.handler = async (ctx: Record<string, unknown>) => {
            const mwState = await runMiddlewareChain(mw, ctx);
            if (Object.keys(mwState).length === 0) return originalHandler(ctx);
            return originalHandler({ ...ctx, ...mwState });
          };
        }
      }
      allRoutes.push(...routes);
    }
  }

  const app = coreCreateServer({
    ...config,
    _entityRoutes: allRoutes.length > 0 ? allRoutes : undefined,
  } as AppConfig);

  // ---------------------------------------------------------------------------
  // Cloud mode branching — bypasses createAuth() entirely (design doc §9)
  // ---------------------------------------------------------------------------
  if (config.cloud?.projectId) {
    const { projectId, cloudBaseUrl = 'https://cloud.vtz.app' } = config.cloud;

    // Warn if both cloud and self-hosted auth are configured
    if (config.auth) {
      console.warn(
        '[vertz] Both cloud.projectId and auth config are set. Cloud mode takes precedence — auth config is ignored.',
      );
    }

    // Guard: requestHandler requires /api prefix
    if (apiPrefix !== '/api') {
      throw new Error(
        `requestHandler requires apiPrefix to be '/api' (got '${apiPrefix}'). ` +
          'Custom API prefixes are not yet supported with cloud auth.',
      );
    }

    // 1. Validate project ID format
    validateProjectId(projectId);

    // 2. Resolve cloud auth context (CI token or developer session)
    const authContext = resolveCloudAuthContext({ projectId });
    console.info(`[vertz] Cloud auth resolved: source=${authContext.source}, project=${projectId}`);

    // 3. Create JWKS client
    const jwksClient = createJWKSClient({
      url: `${cloudBaseUrl}/auth/${projectId}/.well-known/jwks.json`,
    });

    // 4. Create cloud JWT verifier
    // TODO(#1783): Forward algorithm from cloud config when Vertz Cloud migrates to ES256
    const cloudVerifier = createCloudJWTVerifier({
      jwksClient,
      issuer: cloudBaseUrl,
      audience: projectId,
    });

    // 5. Create auth proxy
    const cloudProxy = createAuthProxy({
      projectId,
      cloudBaseUrl,
      authToken: authContext.token,
    });

    // 6. Build cloud auth instance — bypasses createAuth() entirely
    const cloudError = (method: string) =>
      new Error(
        `auth.api.${method}() is not available in cloud mode. ` +
          'Auth operations are handled by the cloud proxy via /api/auth/* routes.',
      );

    const cloudAuth: AuthInstance = {
      handler: cloudProxy,
      api: {
        signUp: async () => {
          throw cloudError('signUp');
        },
        signIn: async () => {
          throw cloudError('signIn');
        },
        signOut: async () => {
          throw cloudError('signOut');
        },
        getSession: async () => {
          throw cloudError('getSession');
        },
        refreshSession: async () => {
          throw cloudError('refreshSession');
        },
        listSessions: async () => {
          throw cloudError('listSessions');
        },
        revokeSession: async () => {
          throw cloudError('revokeSession');
        },
        revokeAllSessions: async () => {
          throw cloudError('revokeAllSessions');
        },
      },
      middleware() {
        throw new Error(
          'auth.middleware() is not available in cloud mode. ' +
            'Use auth.resolveSessionForSSR() for session resolution.',
        );
      },
      initialize: async () => {},
      dispose: () => {},
      resolveSessionForSSR: createSSRResolver({
        cloudVerifier,
        cookieName: 'vertz.sid',
      }),
    };

    // 7. Build ServerInstance
    const authPrefix = `${apiPrefix}/auth`;
    const authPrefixSlash = `${authPrefix}/`;

    const serverInstance = app as AppBuilder & {
      auth: AuthInstance;
      initialize: () => Promise<void>;
      readonly requestHandler: (request: Request) => Promise<Response>;
    };

    serverInstance.auth = cloudAuth;
    serverInstance.initialize = async () => {};

    let cachedCloudRequestHandler: ((request: Request) => Promise<Response>) | null = null;
    Object.defineProperty(serverInstance, 'requestHandler', {
      get() {
        if (!cachedCloudRequestHandler) {
          const entityHandler = this.handler;
          const proxyHandler = this.auth.handler;
          cachedCloudRequestHandler = (request: Request) => {
            const pathname = new URL(request.url).pathname;
            if (pathname === authPrefix || pathname.startsWith(authPrefixSlash)) {
              return proxyHandler(request);
            }
            return entityHandler(request);
          };
        }
        return cachedCloudRequestHandler;
      },
      enumerable: true,
      configurable: false,
    });

    return serverInstance as ServerInstance;
  }

  // ---------------------------------------------------------------------------
  // Wire auth with DB-backed stores when db + auth are provided
  // ---------------------------------------------------------------------------
  if (hasDbClient && config.auth) {
    const dbClient = db as unknown as AuthDbClient;

    // Auto-wire tenant config from access + .tenant() table
    // When auth.access is configured and schema has a .tenant() root,
    // auto-enable tenant endpoints using role-based membership.
    let autoTenant: import('./auth/types').TenantConfig | undefined;
    if (
      crudAccessConfig &&
      tenantResourceType &&
      config.auth.tenant === undefined // Don't override explicit tenant config or explicit disable
    ) {
      const roleStore = crudAccessConfig.roleStore;
      const resourceType = tenantResourceType; // captured after truthiness check
      autoTenant = {
        verifyMembership: async (userId: string, tenantId: string) => {
          const roles = await roleStore.getRoles(userId, resourceType, tenantId);
          return roles.length > 0;
        },
        listTenants: async (userId: string) => {
          const assignments = await roleStore.getRolesForUser(userId);
          const tenantIds = assignments
            .filter((a) => a.resourceType === resourceType)
            .map((a) => a.resourceId);
          if (tenantIds.length === 0) return [];
          // Use entity proxy to fetch tenant details (no raw SQL)
          const entityProxy = registry.createProxy();
          // Find the tenant root entity name (plural, e.g., 'workspaces')
          const tenantEntityName = `${resourceType}s`;
          const tenantEntity = entityProxy[tenantEntityName];
          if (!tenantEntity) return tenantIds.map((id) => ({ id, name: id }));
          const results = await Promise.all(
            tenantIds.map(async (id) => {
              const row = (await tenantEntity.get(id)) as Record<string, unknown> | null;
              return row ? { id, name: (row.name as string) ?? id } : null;
            }),
          );
          return results.filter(Boolean) as import('./auth/types').TenantInfo[];
        },
      };
    }

    // Wire multi-level tenant resolution when tenant levels are available
    if (resolvedTenantLevels?.length && resolvedTenantLevels.length > 1) {
      const levels = resolvedTenantLevels;
      const entityProxy = registry.createProxy();
      const resolveTenantLevel = async (tenantId: string): Promise<string | null> => {
        // Query all tenant-level entity tables in parallel — first match wins
        const results = await Promise.all(
          levels.map(async (level) => {
            const entityName = level.tableName;
            const entity = entityProxy[entityName];
            if (!entity) return null;
            const row = await entity.get(tenantId);
            return row ? level.key : null;
          }),
        );
        return results.find((r) => r !== null) ?? null;
      };
      const tenantLevelNames = levels.map((l) => l.key);

      // Attach to auto-tenant or explicit tenant config
      const tenantTarget = autoTenant ?? (config.auth.tenant as import('./auth/types').TenantConfig | undefined);
      if (tenantTarget) {
        tenantTarget._resolveTenantLevel = resolveTenantLevel;
        tenantTarget._tenantLevelNames = tenantLevelNames;
      }
    }

    // Reuse the auto-wired access stores for auth config (same instances as CRUD pipeline)
    const authAccessConfig = config.auth.access
      ? {
          ...config.auth.access,
          roleStore: crudAccessConfig?.roleStore ?? config.auth.access.roleStore,
          closureStore: crudAccessConfig?.closureStore ?? config.auth.access.closureStore,
        }
      : undefined;

    const authConfig: AuthConfig = {
      ...config.auth,
      // Auto-wire DB-backed stores unless explicitly overridden
      userStore: config.auth.userStore ?? new DbUserStore(dbClient),
      sessionStore: config.auth.sessionStore ?? new DbSessionStore(dbClient),
      // Only auto-wire OAuth account store when providers are configured
      oauthAccountStore:
        config.auth.oauthAccountStore ??
        (config.auth.providers?.length ? new DbOAuthAccountStore(dbClient) : undefined),
      // Auto-wire access stores (roleStore, closureStore) from DB
      access: authAccessConfig,
      // Only create entity proxy when onUserCreated callback exists or when auto-tenant needs it
      _entityProxy:
        config.auth.onUserCreated || autoTenant
          ? (config.auth._entityProxy ?? registry.createProxy())
          : undefined,
      // Auto-wire tenant if detected (access + .tenant() table).
      // tenant: false explicitly disables. Convert to undefined for createAuth.
      tenant: config.auth.tenant === false ? undefined : (config.auth.tenant ?? autoTenant),
    };

    const auth = createAuth(authConfig);

    // Auto-wire auth session middleware so entity/service handlers
    // receive ctx.userId, ctx.tenantId, ctx.roles from the JWT.
    app.middlewares([createAuthSessionMiddleware(auth.api)]);

    // Guard: requestHandler only works with default /api prefix because
    // the auth handler hardcodes url.pathname.replace('/api/auth', '') internally.
    if (apiPrefix !== '/api') {
      throw new Error(
        `requestHandler requires apiPrefix to be '/api' (got '${apiPrefix}'). ` +
          'Custom API prefixes are not yet supported with auth.',
      );
    }

    const authPrefix = `${apiPrefix}/auth`;
    const authPrefixSlash = `${authPrefix}/`;

    const serverInstance = app as AppBuilder & {
      auth: AuthInstance;
      initialize: () => Promise<void>;
      readonly requestHandler: (request: Request) => Promise<Response>;
    };

    serverInstance.auth = auth;
    serverInstance.initialize = async () => {
      await initializeAuthTables(dbClient);
      await auth.initialize();
    };

    let cachedRequestHandler: ((request: Request) => Promise<Response>) | null = null;
    Object.defineProperty(serverInstance, 'requestHandler', {
      get() {
        if (!cachedRequestHandler) {
          const entityHandler = this.handler;
          const authHandler = this.auth.handler;
          cachedRequestHandler = (request: Request) => {
            const pathname = new URL(request.url).pathname;
            if (pathname === authPrefix || pathname.startsWith(authPrefixSlash)) {
              return authHandler(request);
            }
            return entityHandler(request);
          };
        }
        return cachedRequestHandler;
      },
      enumerable: true,
      configurable: false,
    });

    return serverInstance as ServerInstance;
  }

  return app;
}
