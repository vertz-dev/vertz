import { describe, expect, it } from 'bun:test';
import { rules } from '../route-rules';

describe('route access rules builders', () => {
  it('creates a public rule descriptor', () => {
    expect(rules.public).toEqual({ type: 'public' });
  });

  it('creates an authenticated rule descriptor', () => {
    expect(rules.authenticated()).toEqual({ type: 'authenticated' });
  });

  it('creates a role rule descriptor with frozen roles array', () => {
    const rule = rules.role('admin', 'editor');
    expect(rule).toEqual({ type: 'role', roles: ['admin', 'editor'] });
    expect(Object.isFrozen(rule.roles)).toBe(true);
  });

  it('creates an entitlement rule descriptor', () => {
    expect(rules.entitlement('page:view')).toEqual({
      type: 'entitlement',
      entitlement: 'page:view',
    });
  });

  it('creates an fva rule descriptor', () => {
    expect(rules.fva(600)).toEqual({ type: 'fva', maxAge: 600 });
  });

  it('creates an all rule descriptor with frozen rules array', () => {
    const rule = rules.all(rules.authenticated(), rules.entitlement('x'));
    expect(rule.type).toBe('all');
    expect(rule.rules).toHaveLength(2);
    expect(Object.isFrozen(rule.rules)).toBe(true);
  });

  it('creates an any rule descriptor with frozen rules array', () => {
    const rule = rules.any(rules.role('admin'), rules.entitlement('x'));
    expect(rule.type).toBe('any');
    expect(rule.rules).toHaveLength(2);
    expect(Object.isFrozen(rule.rules)).toBe(true);
  });

  it('exposes user markers for where() (server compat)', () => {
    expect(rules.user.id).toEqual({ __marker: 'user.id' });
    expect(rules.user.tenantId).toEqual({ __marker: 'user.tenantId' });
  });

  it('exposes where() builder for server compat (type-excluded from RouteAccessRule)', () => {
    const rule = rules.where({ tenantId: rules.user.tenantId });
    expect(rule).toEqual({
      type: 'where',
      conditions: { tenantId: { __marker: 'user.tenantId' } },
    });
    expect(Object.isFrozen(rule.conditions)).toBe(true);
  });
});
