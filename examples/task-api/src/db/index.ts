/**
 * Database instance — creates the typed database client.
 *
 * Reads DATABASE_URL from the environment. In production this would
 * point to a real PostgreSQL instance; for local development you can
 * use a local Postgres or PGlite.
 */
import { createDb } from '@vertz/db';
import { tables } from './schema';

export const db = createDb({
  url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/task_api',
  models: tables,
  casing: 'snake_case',
});

export { tables } from './schema';
