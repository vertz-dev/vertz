import type { AppBuilder, AppConfig, EntityRouteEntry } from '@vertz/core';
import { createServer as coreCreateServer } from '@vertz/core';
import {
  createDatabaseBridgeAdapter,
  type DatabaseClient,
  type EntityDbAdapter,
  type ModelEntry,
} from '@vertz/db';
import { initializeAuthTables, validateAuthModels } from './auth/auth-tables';
import { DbSessionStore } from './auth/db-session-store';
import type { AuthDbClient } from './auth/db-types';
import { DbUserStore } from './auth/db-user-store';
import { createAuth } from './auth/index';
import type { AuthConfig, AuthInstance } from './auth/types';
import type { EntityOperations } from './entity/entity-operations';
import { EntityRegistry } from './entity/entity-registry';
import { stripHiddenFields } from './entity/field-filter';
import { generateEntityRoutes } from './entity/route-generator';
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

    if (hasDbClient) {
      // Validate all entity models are registered in the DatabaseClient
      const dbModels = (db as DatabaseClient<Record<string, ModelEntry>>)._internals.models;
      const missing = config.entities
        .filter((e) => !(e.name in dbModels))
        .map((e) => `"${e.name}"`);
      if (missing.length > 0) {
        const registered = Object.keys(dbModels)
          .map((k) => `"${k}"`)
          .join(', ');
        const plural = missing.length > 1;
        throw new Error(
          `${plural ? 'Entities' : 'Entity'} ${missing.join(', ')} ${plural ? 'are' : 'is'} not registered in createDb(). ` +
            `Add the missing model${plural ? 's' : ''} to the models object in your createDb() call. ` +
            `Registered models: ${registered || '(none)'}`,
        );
      }

      dbFactory = (entityDef) =>
        createDatabaseBridgeAdapter(
          db as DatabaseClient<Record<string, ModelEntry>>,
          entityDef.name,
        );
    } else if (db) {
      dbFactory = () => db as EntityDbAdapter;
    } else {
      dbFactory = config._entityDbFactory ?? createNoopDbAdapter;
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
      const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, entityDb, {
        apiPrefix,
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
    };

    const auth = createAuth(authConfig);

    const serverInstance = app as AppBuilder & {
      auth: AuthInstance;
      initialize: () => Promise<void>;
    };

    serverInstance.auth = auth;
    serverInstance.initialize = async () => {
      await initializeAuthTables(dbClient);
      await auth.initialize();
    };

    return serverInstance as ServerInstance;
  }

  return app;
}
