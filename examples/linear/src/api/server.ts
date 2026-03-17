/**
 * Linear clone server — auth + entity CRUD.
 *
 * Uses createServer with both db (DatabaseClient) and auth, which auto-wires:
 * - DB-backed UserStore and SessionStore
 * - Entity registry proxy for onUserCreated callback
 */

import { createServer } from '@vertz/server';
import { auth } from './auth';
import { db } from './db';
import { entities } from './entities';

export const app = createServer({
  basePath: '/api',
  entities,
  // biome-ignore lint/suspicious/noExplicitAny: DatabaseClient model variance
  db: db as any,
  auth,
});
