import { describe, expect, it } from 'bun:test';
import { authModels } from '../auth-models';

describe('authModels', () => {
  it('exports models for all 9 auth tables', () => {
    expect(Object.keys(authModels)).toHaveLength(9);
  });

  it('contains auth_users model', () => {
    expect(authModels.auth_users).toBeDefined();
    expect(authModels.auth_users.table._name).toBe('auth_users');
  });

  it('contains auth_sessions model', () => {
    expect(authModels.auth_sessions).toBeDefined();
    expect(authModels.auth_sessions.table._name).toBe('auth_sessions');
  });

  it('contains auth_oauth_accounts model', () => {
    expect(authModels.auth_oauth_accounts).toBeDefined();
    expect(authModels.auth_oauth_accounts.table._name).toBe('auth_oauth_accounts');
  });

  it('contains auth_role_assignments model', () => {
    expect(authModels.auth_role_assignments).toBeDefined();
    expect(authModels.auth_role_assignments.table._name).toBe('auth_role_assignments');
  });

  it('contains auth_closure model', () => {
    expect(authModels.auth_closure).toBeDefined();
    expect(authModels.auth_closure.table._name).toBe('auth_closure');
  });

  it('contains auth_plans model', () => {
    expect(authModels.auth_plans).toBeDefined();
    expect(authModels.auth_plans.table._name).toBe('auth_plans');
  });

  it('contains auth_plan_addons model', () => {
    expect(authModels.auth_plan_addons).toBeDefined();
    expect(authModels.auth_plan_addons.table._name).toBe('auth_plan_addons');
  });

  it('contains auth_flags model', () => {
    expect(authModels.auth_flags).toBeDefined();
    expect(authModels.auth_flags.table._name).toBe('auth_flags');
  });

  it('contains auth_overrides model', () => {
    expect(authModels.auth_overrides).toBeDefined();
    expect(authModels.auth_overrides.table._name).toBe('auth_overrides');
  });
});
