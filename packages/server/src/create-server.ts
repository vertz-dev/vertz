import type { AppBuilder, AppConfig, EntityRouteEntry } from '@vertz/core';
import { createServer as coreCreateServer } from '@vertz/core';
import {
  createDatabaseBridgeAdapter,
  type DatabaseClient,
  type EntityDbAdapter,
  type ModelEntry,
} from '@vertz/db';
import { initializeAuthTables, validateAuthModels } from './auth/auth-tables';
import { DbOAuthAccountStore } from './auth/db-oauth-account-store';
import { DbSessionStore } from './auth/db-session-store';
import type { AuthDbClient } from './auth/db-types';
import { DbUserStore } from './auth/db-user-store';
import { createAuth } from './auth/index';
import type { AuthConfig, AuthInstance } from './auth/types';
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
 * Detects whether the provided db object is a DatabaseClient (query builder)
 * rather than a plain EntityDbAdapter.
 *
 * A DatabaseClient has `_internals` with `models` and `dialect` properties
 * that an EntityDbAdapter does not.
 */
function isDatabaseClient(
  db: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter,
): db is DatabaseClient<Record<string, ModelEntry>> {
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

export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory' | 'entities'> {
  /** Entity definitions created via entity() from @vertz/server */
  entities?: EntityDefinition[];
  /** Standalone service definitions created via service() from @vertz/server */
  services?: ServiceDefinition[];
  /**
   * Database for entity CRUD operations.
   * Accepts either:
   * - A DatabaseClient from createDb() (recommended — auto-bridged per entity)
   * - An EntityDbAdapter (deprecated — simple adapter with get/list/create/update/delete)
   */
  db?: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter;
  /** @internal Factory to create a DB adapter for each entity. Prefer `db` instead. */
  _entityDbFactory?: (entityDef: EntityDefinition) => EntityDbAdapter;
  /** @internal Resolves parent IDs for indirect tenant chain traversal. For testing only. */
  _queryParentIds?: import('./entity/crud-pipeline').QueryParentIdsFn;
  /** @internal Tenant chains for indirect scoping. For testing without DatabaseClient. */
  _tenantChains?: Map<string, import('./entity/tenant-chain').TenantChain>;
  /** Auth configuration — when combined with db, auto-wires DB-backed stores */
  auth?: AuthConfig;
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
  config: ServerConfig & { db: DatabaseClient<Record<string, ModelEntry>>; auth: AuthConfig },
): ServerInstance;
export function createServer(config: ServerConfig): AppBuilder;
export function createServer(config: ServerConfig): AppBuilder | ServerInstance {
  const allRoutes: EntityRouteEntry[] = [];
  const registry = new EntityRegistry();
  const apiPrefix = config.apiPrefix === undefined ? '/api' : config.apiPrefix;
  const { db } = config;
  const hasDbClient = db && isDatabaseClient(db);

  // ---------------------------------------------------------------------------
  // Auth model validation — when both db (DatabaseClient) and auth are provided
  // ---------------------------------------------------------------------------
  if (hasDbClient && config.auth) {
    validateAuthModels(db as unknown as AuthDbClient);
  }

  // Process entities first (so registry has all entities registered for DI)
  if (config.entities && config.entities.length > 0) {
    let dbFactory: (entityDef: EntityDefinition) => EntityDbAdapter;
    // Use def.table for DB lookup (admin entities may share tables via table override)
    const tableOf = (e: EntityDefinition) => e.table ?? e.name;

    if (hasDbClient) {
      // Validate all entity models are registered in the DatabaseClient
      const dbModels = (db as DatabaseClient<Record<string, ModelEntry>>)._internals.models;
      const missing = config.entities
        .filter((e) => !(tableOf(e as EntityDefinition) in dbModels))
        .map((e) => `"${tableOf(e as EntityDefinition)}"`);
      // Deduplicate (multiple entities can share a table)
      const uniqueMissing = [...new Set(missing)];
      if (uniqueMissing.length > 0) {
        const registered = Object.keys(dbModels)
          .map((k) => `"${k}"`)
          .join(', ');
        const plural = uniqueMissing.length > 1;
        throw new Error(
          `${plural ? 'Entities' : 'Entity'} ${uniqueMissing.join(', ')} ${plural ? 'are' : 'is'} not registered in createDb(). ` +
            `Add the missing model${plural ? 's' : ''} to the models object in your createDb() call. ` +
            `Registered models: ${registered || '(none)'}`,
        );
      }

      dbFactory = (entityDef) =>
        createDatabaseBridgeAdapter(
          db as DatabaseClient<Record<string, ModelEntry>>,
          tableOf(entityDef),
        );
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
      // Models are actually ModelDef (which has _tenant), but typed as ModelEntry
      const dbModelsMap = dbClient._internals.models as Record<
        string,
        ModelEntry & { readonly _tenant?: string | null }
      >;
      for (const entityDef of config.entities) {
        const eDef = entityDef as EntityDefinition;
        // Skip entities that explicitly opt out
        if (eDef.tenantScoped === false) continue;
        const modelKey = tableOf(eDef);
        const chain = resolveTenantChain(modelKey, tenantGraph, dbModelsMap);
        if (chain) {
          tenantChains.set(eDef.name, chain);
        }
      }

      // Create queryParentIds from the DatabaseClient for indirect tenant chain traversal
      if (tenantChains.size > 0) {
        queryParentIds = async (tableName: string, where: Record<string, unknown>) => {
          const delegate = (dbClient as Record<string, unknown>)[tableName] as
            | { list: (opts: never) => Promise<{ ok: boolean; data?: unknown[] }> }
            | undefined;
          if (!delegate) return [];
          const result = await delegate.list({ where } as never);
          if (!result.ok || !result.data) return [];
          return (result.data as Record<string, unknown>[]).map((row) => row.id as string);
        };
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

    // Generate routes for each entity
    for (const entityDef of config.entities) {
      const entityDb = dbFactory(entityDef as EntityDefinition);
      const tenantChain = tenantChains.get(entityDef.name) ?? null;
      const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, entityDb, {
        apiPrefix,
        tenantChain,
        queryParentIds: tenantChain ? (queryParentIds ?? config._queryParentIds) : undefined,
      });
      allRoutes.push(...routes);
    }
  }

  // Process services after entities (services use registry for entity DI)
  if (config.services && config.services.length > 0) {
    for (const serviceDef of config.services) {
      const routes = generateServiceRoutes(serviceDef, registry, { apiPrefix });
      allRoutes.push(...routes);
    }
  }

  const app = coreCreateServer({
    ...config,
    _entityRoutes: allRoutes.length > 0 ? allRoutes : undefined,
  } as AppConfig);

  // ---------------------------------------------------------------------------
  // Wire auth with DB-backed stores when db + auth are provided
  // ---------------------------------------------------------------------------
  if (hasDbClient && config.auth) {
    const dbClient = db as unknown as AuthDbClient;
    const authConfig: AuthConfig = {
      ...config.auth,
      // Auto-wire DB-backed stores unless explicitly overridden
      userStore: config.auth.userStore ?? new DbUserStore(dbClient),
      sessionStore: config.auth.sessionStore ?? new DbSessionStore(dbClient),
      // Only auto-wire OAuth account store when providers are configured
      oauthAccountStore:
        config.auth.oauthAccountStore ??
        (config.auth.providers?.length ? new DbOAuthAccountStore(dbClient) : undefined),
      // Only create entity proxy when onUserCreated callback exists
      _entityProxy:
        config.auth.onUserCreated
          ? (config.auth._entityProxy ?? registry.createProxy())
          : undefined,
    };

    const auth = createAuth(authConfig);

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
