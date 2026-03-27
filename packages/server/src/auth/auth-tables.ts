/**
 * Auth table DDL generation.
 *
 * Produces CREATE TABLE IF NOT EXISTS statements for all 9 auth tables.
 * Dialect-aware: works on both SQLite and PostgreSQL.
 */

import { sql } from '@vertz/db/sql';
import type { AuthDbClient } from './db-types';
import { type DbDialectName, dialectDDL } from './dialect-ddl';

/**
 * Generate DDL statements for all auth tables.
 * Returns an array of SQL strings, one per CREATE TABLE statement.
 */
export function generateAuthDDL(dialect: DbDialectName): string[] {
  const t = dialectDDL(dialect);
  const statements: string[] = [];

  // 1. auth_users
  statements.push(`CREATE TABLE IF NOT EXISTS auth_users (
  id ${t.textPrimary()},
  email ${t.text()} NOT NULL UNIQUE,
  password_hash ${t.text()},
  role ${t.text()} NOT NULL DEFAULT 'user',
  email_verified ${t.boolean(false)},
  last_tenant_id ${t.text()},
  created_at ${t.timestamp()},
  updated_at ${t.timestamp()}
)`);

  // 2. auth_sessions
  statements.push(`CREATE TABLE IF NOT EXISTS auth_sessions (
  id ${t.textPrimary()},
  user_id ${t.text()} NOT NULL,
  refresh_token_hash ${t.text()} NOT NULL,
  previous_refresh_hash ${t.text()},
  current_tokens ${t.text()},
  ip_address ${t.text()} NOT NULL,
  user_agent ${t.text()} NOT NULL,
  created_at ${t.timestamp()},
  last_active_at ${t.timestamp()},
  expires_at ${t.timestamp()},
  revoked_at ${t.timestampNullable()}
)`);

  // 3. auth_oauth_accounts
  statements.push(`CREATE TABLE IF NOT EXISTS auth_oauth_accounts (
  id ${t.textPrimary()},
  user_id ${t.text()} NOT NULL,
  provider ${t.text()} NOT NULL,
  provider_id ${t.text()} NOT NULL,
  email ${t.text()},
  created_at ${t.timestamp()},
  UNIQUE(provider, provider_id)
)`);

  // 4. auth_role_assignments
  statements.push(`CREATE TABLE IF NOT EXISTS auth_role_assignments (
  id ${t.textPrimary()},
  user_id ${t.text()} NOT NULL,
  resource_type ${t.text()} NOT NULL,
  resource_id ${t.text()} NOT NULL,
  role ${t.text()} NOT NULL,
  created_at ${t.timestamp()},
  UNIQUE(user_id, resource_type, resource_id, role)
)`);

  // 5. auth_closure
  statements.push(`CREATE TABLE IF NOT EXISTS auth_closure (
  id ${t.textPrimary()},
  ancestor_type ${t.text()} NOT NULL,
  ancestor_id ${t.text()} NOT NULL,
  descendant_type ${t.text()} NOT NULL,
  descendant_id ${t.text()} NOT NULL,
  depth ${t.integer()} NOT NULL,
  UNIQUE(ancestor_type, ancestor_id, descendant_type, descendant_id)
)`);

  // 6. auth_plans
  statements.push(`CREATE TABLE IF NOT EXISTS auth_plans (
  id ${t.textPrimary()},
  resource_type ${t.text()} NOT NULL,
  resource_id ${t.text()} NOT NULL,
  plan_id ${t.text()} NOT NULL,
  started_at ${t.timestamp()},
  expires_at ${t.timestampNullable()},
  UNIQUE(resource_type, resource_id)
)`);

  // 7. auth_plan_addons
  statements.push(`CREATE TABLE IF NOT EXISTS auth_plan_addons (
  id ${t.textPrimary()},
  resource_type ${t.text()} NOT NULL,
  resource_id ${t.text()} NOT NULL,
  addon_id ${t.text()} NOT NULL,
  is_one_off ${t.boolean(false)},
  quantity ${t.integer()} NOT NULL DEFAULT 1,
  created_at ${t.timestamp()},
  UNIQUE(resource_type, resource_id, addon_id)
)`);

  // 8. auth_flags
  statements.push(`CREATE TABLE IF NOT EXISTS auth_flags (
  id ${t.textPrimary()},
  resource_type ${t.text()} NOT NULL,
  resource_id ${t.text()} NOT NULL,
  flag ${t.text()} NOT NULL,
  enabled ${t.boolean(false)},
  UNIQUE(resource_type, resource_id, flag)
)`);

  // 9. auth_overrides
  statements.push(`CREATE TABLE IF NOT EXISTS auth_overrides (
  id ${t.textPrimary()},
  resource_type ${t.text()} NOT NULL,
  resource_id ${t.text()} NOT NULL,
  overrides ${t.text()} NOT NULL,
  updated_at ${t.timestamp()},
  UNIQUE(resource_type, resource_id)
)`);

  return statements;
}

/**
 * Names of all auth tables — used for model validation.
 */
export const AUTH_TABLE_NAMES = [
  'auth_users',
  'auth_sessions',
  'auth_oauth_accounts',
  'auth_role_assignments',
  'auth_closure',
  'auth_plans',
  'auth_plan_addons',
  'auth_flags',
  'auth_overrides',
] as const;

/**
 * Validate that all required auth models are registered in the DatabaseClient.
 *
 * Throws a prescriptive error when models are missing, telling the developer
 * exactly what to add to their createDb() call.
 */
export function validateAuthModels(db: AuthDbClient): void {
  const dbModels = db._internals.models;
  const missing = AUTH_TABLE_NAMES.filter((m) => !(m in dbModels));
  if (missing.length > 0) {
    throw new Error(
      `Auth requires models ${missing.map((m) => `"${m}"`).join(', ')} in createDb(). ` +
        'Add authModels to your createDb() call: createDb({ models: { ...authModels, ...yourModels } })',
    );
  }
}

/**
 * Initialize auth tables in the database.
 *
 * Executes CREATE TABLE IF NOT EXISTS for all 9 auth tables.
 * Idempotent — safe to call on every server start.
 */
export async function initializeAuthTables(db: AuthDbClient): Promise<void> {
  const dialectName: DbDialectName = db._internals.dialect.name;
  const statements = generateAuthDDL(dialectName);

  for (const ddl of statements) {
    await db.query(sql.raw(ddl));
  }
}
