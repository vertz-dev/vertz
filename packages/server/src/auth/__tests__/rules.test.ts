import { describe, expect, it } from 'bun:test';
import { rules } from '../rules';

describe('rules builders', () => {
  describe('rules.role()', () => {
    it('creates a role rule with one role', () => {
      const rule = rules.role('admin');
      expect(rule.type).toBe('role');
      expect(rule.roles).toEqual(['admin']);
    });

    it('creates a role rule with multiple roles (OR)', () => {
      const rule = rules.role('editor', 'admin');
      expect(rule.type).toBe('role');
      expect(rule.roles).toEqual(['editor', 'admin']);
    });
  });

  describe('rules.entitlement()', () => {
    it('creates an entitlement rule', () => {
      const rule = rules.entitlement('project:view');
      expect(rule.type).toBe('entitlement');
      expect(rule.entitlement).toBe('project:view');
    });
  });

  describe('rules.where()', () => {
    it('creates a where rule with static conditions', () => {
      const rule = rules.where({ archived: false });
      expect(rule.type).toBe('where');
      expect(rule.conditions).toEqual({ archived: false });
    });

    it('creates a where rule with user marker', () => {
      const rule = rules.where({ createdBy: rules.user.id });
      expect(rule.type).toBe('where');
      expect(rule.conditions.createdBy).toEqual({ __marker: 'user.id' });
    });

    it('creates a where rule with tenantId marker', () => {
      const rule = rules.where({ orgId: rules.user.tenantId });
      expect(rule.type).toBe('where');
      expect(rule.conditions.orgId).toEqual({ __marker: 'user.tenantId' });
    });
  });

  describe('rules.all()', () => {
    it('combines rules with AND logic', () => {
      const r1 = rules.role('admin');
      const r2 = rules.where({ archived: false });
      const combined = rules.all(r1, r2);
      expect(combined.type).toBe('all');
      expect(combined.rules).toHaveLength(2);
      expect(combined.rules[0]).toBe(r1);
      expect(combined.rules[1]).toBe(r2);
    });
  });

  describe('rules.any()', () => {
    it('combines rules with OR logic', () => {
      const r1 = rules.entitlement('project:edit');
      const r2 = rules.where({ createdBy: rules.user.id });
      const combined = rules.any(r1, r2);
      expect(combined.type).toBe('any');
      expect(combined.rules).toHaveLength(2);
    });
  });

  describe('rules.authenticated()', () => {
    it('creates an authenticated rule', () => {
      const rule = rules.authenticated();
      expect(rule.type).toBe('authenticated');
    });
  });

  describe('rules.fva()', () => {
    it('creates an fva rule with max age', () => {
      const rule = rules.fva(600);
      expect(rule.type).toBe('fva');
      expect(rule.maxAge).toBe(600);
    });
  });

  describe('rules.user markers', () => {
    it('has id marker', () => {
      expect(rules.user.id).toEqual({ __marker: 'user.id' });
    });

    it('has tenantId marker', () => {
      expect(rules.user.tenantId).toEqual({ __marker: 'user.tenantId' });
    });
  });

  describe('rule composition', () => {
    it('supports nested all/any', () => {
      const rule = rules.all(
        rules.authenticated(),
        rules.any(rules.entitlement('project:edit'), rules.where({ createdBy: rules.user.id })),
      );
      expect(rule.type).toBe('all');
      expect(rule.rules).toHaveLength(2);
      expect(rule.rules[0].type).toBe('authenticated');
      expect(rule.rules[1].type).toBe('any');
    });
  });
});
