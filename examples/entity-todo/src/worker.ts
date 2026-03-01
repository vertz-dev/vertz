/**
 * Cloudflare Worker entry point for Entity Todo.
 *
 * Uses @vertz/cloudflare's createHandler for automatic route splitting:
 * - /api/* → JSON API handler (auto-generated entity routes, D1 database)
 * - /*     → SSR HTML render (zero-boilerplate via SSR module config)
 */

import { createHandler } from '@vertz/cloudflare';
import { createDb } from '@vertz/db';
import { createServer, type ServerConfig } from '@vertz/server';
import * as app from '../dist/server/app';
import { todos } from './entities';
import { todosModel } from './schema';

interface Env {
  DB: D1Database;
}

export default createHandler({
  app: (env) => {
    const typedEnv = env as Env;
    const db = createDb({
      models: { todos: todosModel },
      dialect: 'sqlite',
      // biome-ignore lint/suspicious/noExplicitAny: Cloudflare D1 binding → @vertz/db D1Database
      d1: typedEnv.DB as any,
    });

    return createServer({
      basePath: '/api',
      entities: [todos],
      // biome-ignore lint/suspicious/noExplicitAny: DatabaseClient variance — specific model → generic
      db: db as any as ServerConfig['db'],
    });
  },
  basePath: '/api',
  ssr: {
    module: app,
    clientScript: '/assets/entry-client.js',
    title: 'Entity Todo — vertz full-stack demo',
  },
  securityHeaders: true,
});
