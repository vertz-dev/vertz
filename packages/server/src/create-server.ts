import type { AppBuilder, AppConfig, EntityRouteEntry } from '@vertz/core';
import { createServer as coreCreateServer } from '@vertz/core';
import type { EntityDbAdapter } from './entity/crud-pipeline';
import { EntityRegistry } from './entity/entity-registry';
import { generateEntityRoutes } from './entity/route-generator';
import type { EntityDefinition } from './entity/types';

// ---------------------------------------------------------------------------
// Extended config for @vertz/server's createServer
// ---------------------------------------------------------------------------

export interface ServerConfig extends Omit<AppConfig, '_entityDbFactory'> {
  /** Factory to create a DB adapter for each entity. If not provided, a no-op adapter is used. */
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
      return [];
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
    const dbFactory = config._entityDbFactory ?? createNoopDbAdapter;
    const apiPrefix = config.apiPrefix === undefined ? '/api' : config.apiPrefix;

    // Generate routes for each entity
    entityRoutes = [];
    for (const entityDef of config.entities) {
      const db = dbFactory(entityDef as EntityDefinition);
      const routes = generateEntityRoutes(entityDef as EntityDefinition, registry, db, {
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
