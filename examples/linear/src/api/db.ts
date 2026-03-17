/**
 * Database setup for the Linear clone.
 *
 * Uses createDb() with path-based SQLite and autoMigrate to create/update
 * tables from the schema model definitions. No hand-written DDL.
 */

import { createDb } from '@vertz/db';
import { authModels } from '@vertz/server';
import { commentsModel, issuesModel, projectsModel, tenantsModel, usersModel } from './schema';
import { seedDatabase } from './seed';

const DB_PATH = './data/linear.db';

export const db = createDb({
  models: {
    ...authModels,
    tenants: tenantsModel,
    users: usersModel,
    projects: projectsModel,
    issues: issuesModel,
    comments: commentsModel,
  },
  dialect: 'sqlite',
  path: DB_PATH,
  migrations: { autoApply: true },
});

// First query triggers autoMigrate (creates tables from model definitions).
// seedDatabase checks if the database is empty and seeds if needed.
await seedDatabase(db);
