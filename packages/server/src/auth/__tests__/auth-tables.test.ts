import { describe, expect, it } from '@vertz/test';
import { AUTH_TABLE_NAMES, generateAuthDDL } from '../auth-tables';

describe('generateAuthDDL', () => {
  it('generates 9 CREATE TABLE IF NOT EXISTS statements for sqlite', () => {
    const statements = generateAuthDDL('sqlite');
    expect(statements).toHaveLength(9);
    for (const stmt of statements) {
      expect(stmt).toContain('CREATE TABLE IF NOT EXISTS');
    }
  });

  it('generates 9 CREATE TABLE IF NOT EXISTS statements for postgres', () => {
    const statements = generateAuthDDL('postgres');
    expect(statements).toHaveLength(9);
    for (const stmt of statements) {
      expect(stmt).toContain('CREATE TABLE IF NOT EXISTS');
    }
  });

  it('creates auth_users table with correct columns for sqlite', () => {
    const statements = generateAuthDDL('sqlite');
    const usersTable = statements[0]!;
    expect(usersTable).toContain('auth_users');
    expect(usersTable).toContain('id TEXT PRIMARY KEY');
    expect(usersTable).toContain('email TEXT NOT NULL UNIQUE');
    expect(usersTable).toContain('password_hash TEXT');
    expect(usersTable).toContain('email_verified INTEGER NOT NULL DEFAULT 0');
    expect(usersTable).toContain('created_at TEXT NOT NULL');
  });

  it('creates auth_users table with correct columns for postgres', () => {
    const statements = generateAuthDDL('postgres');
    const usersTable = statements[0]!;
    expect(usersTable).toContain('auth_users');
    expect(usersTable).toContain('email_verified BOOLEAN NOT NULL DEFAULT false');
    expect(usersTable).toContain('created_at TIMESTAMPTZ NOT NULL');
  });

  it('creates auth_sessions table with current_tokens column', () => {
    const statements = generateAuthDDL('sqlite');
    const sessionsTable = statements[1]!;
    expect(sessionsTable).toContain('auth_sessions');
    expect(sessionsTable).toContain('current_tokens TEXT');
    expect(sessionsTable).toContain('refresh_token_hash TEXT NOT NULL');
    expect(sessionsTable).toContain('previous_refresh_hash TEXT');
    expect(sessionsTable).toContain('revoked_at TEXT');
  });

  it('creates auth_oauth_accounts with unique provider constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const oauthTable = statements[2]!;
    expect(oauthTable).toContain('auth_oauth_accounts');
    expect(oauthTable).toContain('UNIQUE(provider, provider_id)');
  });

  it('creates auth_role_assignments with unique composite constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const roleTable = statements[3]!;
    expect(roleTable).toContain('auth_role_assignments');
    expect(roleTable).toContain('UNIQUE(user_id, resource_type, resource_id, role)');
  });

  it('creates auth_closure with unique composite constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const closureTable = statements[4]!;
    expect(closureTable).toContain('auth_closure');
    expect(closureTable).toContain(
      'UNIQUE(ancestor_type, ancestor_id, descendant_type, descendant_id)',
    );
    expect(closureTable).toContain('depth INTEGER NOT NULL');
  });

  it('creates auth_plans with (resource_type, resource_id) unique constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const plansTable = statements[5]!;
    expect(plansTable).toContain('auth_plans');
    expect(plansTable).toContain('resource_type TEXT NOT NULL');
    expect(plansTable).toContain('resource_id TEXT NOT NULL');
    expect(plansTable).toContain('UNIQUE(resource_type, resource_id)');
  });

  it('creates auth_plan_addons with (resource_type, resource_id, addon_id) unique constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const addonsTable = statements[6]!;
    expect(addonsTable).toContain('auth_plan_addons');
    expect(addonsTable).toContain('resource_type TEXT NOT NULL');
    expect(addonsTable).toContain('resource_id TEXT NOT NULL');
    expect(addonsTable).toContain('is_one_off INTEGER NOT NULL DEFAULT 0');
    expect(addonsTable).toContain('quantity INTEGER NOT NULL DEFAULT 1');
    expect(addonsTable).toContain('UNIQUE(resource_type, resource_id, addon_id)');
  });

  it('creates auth_flags with (resource_type, resource_id, flag) unique constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const flagsTable = statements[7]!;
    expect(flagsTable).toContain('auth_flags');
    expect(flagsTable).toContain('resource_type');
    expect(flagsTable).toContain('resource_id');
    expect(flagsTable).toContain('UNIQUE(resource_type, resource_id, flag)');
  });

  it('creates auth_overrides with (resource_type, resource_id) unique constraint', () => {
    const statements = generateAuthDDL('sqlite');
    const overridesTable = statements[8]!;
    expect(overridesTable).toContain('auth_overrides');
    expect(overridesTable).toContain('resource_type TEXT NOT NULL');
    expect(overridesTable).toContain('resource_id TEXT NOT NULL');
    expect(overridesTable).toContain('UNIQUE(resource_type, resource_id)');
    expect(overridesTable).toContain('overrides TEXT NOT NULL');
  });
});

describe('AUTH_TABLE_NAMES', () => {
  it('contains 9 table names', () => {
    expect(AUTH_TABLE_NAMES).toHaveLength(9);
  });

  it('all names start with auth_', () => {
    for (const name of AUTH_TABLE_NAMES) {
      expect(name.startsWith('auth_')).toBe(true);
    }
  });
});
