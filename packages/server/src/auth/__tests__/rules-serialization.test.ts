import { describe, expect, it } from 'bun:test';
import { defineAccess } from '../define-access';
import {
  rules,
  serializeAccessDefinitions,
  serializeEntityRules,
  serializeRule,
} from '../rules';

// ============================================================================
// Feature: rules.* serialization
// ============================================================================

describe('Feature: rules.* serialization', () => {
  // --------------------------------------------------------------------------
  // serializeRule — individual rule serialization
  // --------------------------------------------------------------------------

  describe('Given a PublicRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "public" }', () => {
        const result = serializeRule(rules.public);
        expect(result).toEqual({ type: 'public' });
      });
    });
  });

  describe('Given an AuthenticatedRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "authenticated" }', () => {
        const result = serializeRule(rules.authenticated());
        expect(result).toEqual({ type: 'authenticated' });
      });
    });
  });

  describe('Given a RoleRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "role", names: [...] }', () => {
        const result = serializeRule(rules.role('admin', 'owner'));
        expect(result).toEqual({ type: 'role', names: ['admin', 'owner'] });
      });
    });
  });

  describe('Given an EntitlementRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "entitlement", value: "..." }', () => {
        const result = serializeRule(rules.entitlement('task:update'));
        expect(result).toEqual({ type: 'entitlement', value: 'task:update' });
      });
    });
  });

  describe('Given a WhereRule with static conditions', () => {
    describe('When serializing', () => {
      it('Then produces { type: "where", conditions: {...} }', () => {
        const result = serializeRule(rules.where({ status: 'active' }));
        expect(result).toEqual({ type: 'where', conditions: { status: 'active' } });
      });
    });
  });

  describe('Given a WhereRule with rules.user.id marker', () => {
    describe('When serializing', () => {
      it('Then serializes the marker as { __marker: "user.id" }', () => {
        const result = serializeRule(rules.where({ createdBy: rules.user.id }));
        expect(result).toEqual({
          type: 'where',
          conditions: { createdBy: { __marker: 'user.id' } },
        });
      });
    });
  });

  describe('Given a WhereRule with rules.user.tenantId marker', () => {
    describe('When serializing', () => {
      it('Then serializes the marker as { __marker: "user.tenantId" }', () => {
        const result = serializeRule(rules.where({ tenantId: rules.user.tenantId }));
        expect(result).toEqual({
          type: 'where',
          conditions: { tenantId: { __marker: 'user.tenantId' } },
        });
      });
    });
  });

  describe('Given an AllRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "all", rules: [...] } with nested serialized rules', () => {
        const result = serializeRule(
          rules.all(rules.authenticated(), rules.entitlement('task:update')),
        );
        expect(result).toEqual({
          type: 'all',
          rules: [{ type: 'authenticated' }, { type: 'entitlement', value: 'task:update' }],
        });
      });
    });
  });

  describe('Given an AnyRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "any", rules: [...] } with nested serialized rules', () => {
        const result = serializeRule(
          rules.any(rules.role('admin'), rules.entitlement('task:delete')),
        );
        expect(result).toEqual({
          type: 'any',
          rules: [
            { type: 'role', names: ['admin'] },
            { type: 'entitlement', value: 'task:delete' },
          ],
        });
      });
    });
  });

  describe('Given a FvaRule', () => {
    describe('When serializing', () => {
      it('Then produces { type: "fva", maxAge: N }', () => {
        const result = serializeRule(rules.fva(600));
        expect(result).toEqual({ type: 'fva', maxAge: 600 });
      });
    });
  });

  describe('Given deeply nested rules', () => {
    describe('When serializing', () => {
      it('Then recursively serializes all levels', () => {
        const result = serializeRule(
          rules.all(
            rules.entitlement('task:update'),
            rules.any(rules.role('admin'), rules.where({ createdBy: rules.user.id })),
          ),
        );
        expect(result).toEqual({
          type: 'all',
          rules: [
            { type: 'entitlement', value: 'task:update' },
            {
              type: 'any',
              rules: [
                { type: 'role', names: ['admin'] },
                { type: 'where', conditions: { createdBy: { __marker: 'user.id' } } },
              ],
            },
          ],
        });
      });
    });
  });

  describe('Given any serialized rule', () => {
    describe('When JSON.stringify → JSON.parse round-tripped', () => {
      it('Then output is identical (no functions, no circular refs)', () => {
        const complexRule = rules.all(
          rules.authenticated(),
          rules.entitlement('task:update'),
          rules.where({ createdBy: rules.user.id }),
          rules.any(rules.role('admin'), rules.fva(300)),
        );
        const serialized = serializeRule(complexRule);
        const roundTripped = JSON.parse(JSON.stringify(serialized));
        expect(roundTripped).toEqual(serialized);
      });
    });
  });

  // --------------------------------------------------------------------------
  // serializeAccessDefinitions — role → entitlement mappings
  // --------------------------------------------------------------------------

  describe('Given a defineAccess() config with entitlements', () => {
    describe('When calling serializeAccessDefinitions()', () => {
      it('Then produces JSON with role → entitlement mappings', () => {
        const accessDef = defineAccess({
          entities: {
            project: { roles: ['manager', 'contributor', 'viewer'] },
          },
          entitlements: {
            'project:view': { roles: ['viewer', 'contributor', 'manager'] },
            'project:edit': { roles: ['contributor', 'manager'] },
            'project:delete': { roles: ['manager'] },
          },
        });

        const result = serializeAccessDefinitions(accessDef);
        expect(result).toEqual({
          roles: {
            manager: ['project:view', 'project:edit', 'project:delete'],
            contributor: ['project:view', 'project:edit'],
            viewer: ['project:view'],
          },
        });
      });
    });
  });

  describe('Given a defineAccess() config with no entitlements', () => {
    describe('When calling serializeAccessDefinitions()', () => {
      it('Then produces empty roles map', () => {
        const accessDef = defineAccess({
          entities: {
            project: { roles: ['admin'] },
          },
          entitlements: {},
        });

        const result = serializeAccessDefinitions(accessDef);
        expect(result).toEqual({ roles: {} });
      });
    });
  });

  describe('Given a defineAccess() config', () => {
    describe('When serializing access definitions', () => {
      it('Then the output is JSON.parse-able', () => {
        const accessDef = defineAccess({
          entities: {
            project: { roles: ['manager', 'viewer'] },
          },
          entitlements: {
            'project:view': { roles: ['viewer', 'manager'] },
          },
        });

        const result = serializeAccessDefinitions(accessDef);
        const roundTripped = JSON.parse(JSON.stringify(result));
        expect(roundTripped).toEqual(result);
      });
    });
  });

  // --------------------------------------------------------------------------
  // serializeEntityRules — entity access rules
  // --------------------------------------------------------------------------

  describe('Given entity definitions with declarative rules', () => {
    describe('When calling serializeEntityRules()', () => {
      it('Then serializes all rule types per operation', () => {
        const entities = [
          {
            kind: 'entity' as const,
            name: 'tasks',
            access: {
              list: rules.authenticated(),
              create: rules.entitlement('task:create'),
              update: rules.all(
                rules.entitlement('task:update'),
                rules.where({ createdBy: rules.user.id }),
              ),
              delete: rules.entitlement('task:delete'),
            },
          },
        ];

        const result = serializeEntityRules(entities as any);
        expect(result).toEqual({
          tasks: {
            list: { type: 'authenticated' },
            create: { type: 'entitlement', value: 'task:create' },
            update: {
              type: 'all',
              rules: [
                { type: 'entitlement', value: 'task:update' },
                { type: 'where', conditions: { createdBy: { __marker: 'user.id' } } },
              ],
            },
            delete: { type: 'entitlement', value: 'task:delete' },
          },
        });
      });
    });
  });

  describe('Given entity definitions with false (deny) rules', () => {
    describe('When calling serializeEntityRules()', () => {
      it('Then serializes false as { type: "deny" }', () => {
        const entities = [
          {
            kind: 'entity' as const,
            name: 'system-config',
            access: {
              list: rules.public,
              delete: false,
            },
          },
        ];

        const result = serializeEntityRules(entities as any);
        expect(result).toEqual({
          'system-config': {
            list: { type: 'public' },
            delete: { type: 'deny' },
          },
        });
      });
    });
  });

  describe('Given entity definitions with callback rules', () => {
    describe('When calling serializeEntityRules()', () => {
      it('Then skips callback rules (not serializable)', () => {
        const entities = [
          {
            kind: 'entity' as const,
            name: 'posts',
            access: {
              list: rules.authenticated(),
              update: (ctx: any) => ctx.authenticated(),
            },
          },
        ];

        const result = serializeEntityRules(entities as any);
        expect(result).toEqual({
          posts: {
            list: { type: 'authenticated' },
          },
        });
      });
    });
  });

  describe('Given multiple entity definitions', () => {
    describe('When calling serializeEntityRules()', () => {
      it('Then produces entries for each entity', () => {
        const entities = [
          {
            kind: 'entity' as const,
            name: 'projects',
            access: {
              list: rules.authenticated(),
            },
          },
          {
            kind: 'entity' as const,
            name: 'tasks',
            access: {
              list: rules.entitlement('task:list'),
              get: rules.entitlement('task:view'),
            },
          },
        ];

        const result = serializeEntityRules(entities as any);
        expect(result).toEqual({
          projects: {
            list: { type: 'authenticated' },
          },
          tasks: {
            list: { type: 'entitlement', value: 'task:list' },
            get: { type: 'entitlement', value: 'task:view' },
          },
        });
      });
    });
  });

  describe('Given entity definitions with no access rules', () => {
    describe('When calling serializeEntityRules()', () => {
      it('Then produces an empty rules object for that entity', () => {
        const entities = [
          {
            kind: 'entity' as const,
            name: 'logs',
            access: {},
          },
        ];

        const result = serializeEntityRules(entities as any);
        expect(result).toEqual({
          logs: {},
        });
      });
    });
  });

  describe('Given the serialized entity rules', () => {
    describe('When JSON.stringify → JSON.parse round-tripped', () => {
      it('Then output is identical', () => {
        const entities = [
          {
            kind: 'entity' as const,
            name: 'tasks',
            access: {
              list: rules.authenticated(),
              update: rules.all(
                rules.entitlement('task:update'),
                rules.where({ createdBy: rules.user.id }),
              ),
            },
          },
        ];

        const result = serializeEntityRules(entities as any);
        const roundTripped = JSON.parse(JSON.stringify(result));
        expect(roundTripped).toEqual(result);
      });
    });
  });
});
