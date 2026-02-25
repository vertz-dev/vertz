import type { AppBuilder, AppConfig, EntityRouteEntry } from '@vertz/core';
import { createServer as coreCreateServer } from '@vertz/core';
import {
  createDatabaseBridgeAdapter,
  type DatabaseClient,
  type EntityDbAdapter,
  type ModelEntry,
} from '@vertz/db';
import { EntityRegistry } from './entity/entity-registry';
import { generateEntityRoutes } from './entity/route-generator';
import type { EntityDefinition } from './entity/types';

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
// Extended config for @vertz/server's createServer
// ---------------------------------------------------------------------------

export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory' | 'entities'> {
  /** Entity definitions created via entity() from @vertz/server */
  entities?: EntityDefinition[];
  /**
   * Database for entity CRUD operations.
   * Accepts either:
   * - A DatabaseClient from createDb() (recommended — auto-bridged per entity)
   * - An EntityDbAdapter (deprecated — simple adapter with get/list/create/update/delete)
   */
  db?: DatabaseClient<Record<string, ModelEntry>> | EntityDbAdapter;
  /** @internal Factory to create a DB adapter for each entity. Prefer `db` instead. */
  _entityDbFactory?: (entityDef: EntityDefinition) => EntityDbAdapter;
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
// createServer wrapper
// ---------------------------------------------------------------------------

/**
 * Creates an HTTP server with entity route generation.
 * Wraps @vertz/core's createServer to inject entity CRUD handlers.
 */
export function createServer(config: ServerConfig): AppBuilder {
  let entityRoutes: EntityRouteEntry[] | undefined;

  if (config.entities && config.entities.length > 0) {
    const registry = new EntityRegistry();
    const { db } = config;
    let dbFactory: (entityDef: EntityDefinition) => EntityDbAdapter;

    if (db && isDatabaseClient(db)) {
      // DatabaseClient detected — create bridge adapters per entity
      dbFactory = (entityDef) =>
        createDatabaseBridgeAdapter(
          db as DatabaseClient<Record<string, ModelEntry>>,
          entityDef.name,
        );
    } else if (db) {
      // Plain EntityDbAdapter — use directly
      dbFactory = () => db as EntityDbAdapter;
    } else {
      dbFactory = config._entityDbFactory ?? createNoopDbAdapter;
    }

    const apiPrefix = config.apiPrefix === undefined ? '/api' : config.apiPrefix;

    // Generate routes for each entity
    entityRoutes = [];
    for (const entityDef of config.entities) {
      const entityDb = dbFactory(entityDef as EntityDefinition);
      const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, entityDb, {
        apiPrefix,
      });
      entityRoutes.push(...routes);
    }
  }

  return coreCreateServer({
    ...config,
    _entityRoutes: entityRoutes,
  } as AppConfig);
}
