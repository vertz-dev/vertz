/**
 * Database setup for the Linear clone.
 *
 * Uses Bun's built-in SQLite wrapped as a D1-compatible binding so we can
 * use createDb() with dialect: 'sqlite'. This gives us a full DatabaseClient
 * which auto-wires auth stores when passed to createServer().
 */

import { Database, type SQLQueryBindings } from 'bun:sqlite';
import { createDb } from '@vertz/db';
import { authModels } from '@vertz/server';
import { usersModel } from './schema';

// ---------------------------------------------------------------------------
// D1-compatible wrapper for bun:sqlite
// ---------------------------------------------------------------------------

function createBunD1(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.exec('PRAGMA journal_mode=WAL');
  sqlite.exec('PRAGMA foreign_keys=ON');

  // Auto-create app tables (dev only — production uses migrations)
  sqlite.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    avatar_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  return {
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      return {
        bind(...values: unknown[]) {
          return {
            all: async () => ({
              results: stmt.all(...(values as SQLQueryBindings[])) as unknown[],
            }),
            run: async () => {
              const info = stmt.run(...(values as SQLQueryBindings[]));
              return { meta: { changes: info.changes } };
            },
          };
        },
        all: async () => ({ results: stmt.all() as unknown[] }),
        run: async () => {
          const info = stmt.run();
          return { meta: { changes: info.changes } };
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Database instance
// ---------------------------------------------------------------------------

const d1 = createBunD1('./data/linear.db');

export const db = createDb({
  models: { ...authModels, users: usersModel },
  dialect: 'sqlite',
  // biome-ignore lint/suspicious/noExplicitAny: bun:sqlite D1 wrapper
  d1: d1 as any,
});
