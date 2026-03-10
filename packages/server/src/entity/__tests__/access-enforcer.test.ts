import { describe, expect, it } from 'bun:test';
import { EntityForbiddenError } from '@vertz/errors';
import { rules } from '../../auth/rules';
import {
  type EnforceAccessOptions,
  enforceAccess,
  extractWhereConditions,
} from '../access-enforcer';
import type { BaseContext, EntityContext } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubCtx(overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    userId: 'user-1',
    tenantId: null,
    authenticated: () => true,
    tenant: () => false,
    role: () => false,
    entity: {} as EntityContext['entity'],
    entities: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: enforceAccess', () => {
  describe('Given no access rule for the operation', () => {
    describe('When enforceAccess is called', () => {
      it('Then returns err(EntityForbiddenError) (deny by default)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('create', {}, ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given access rule is false (disabled)', () => {
    describe('When enforceAccess is called', () => {
      it('Then returns err(EntityForbiddenError) with "disabled" message', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('delete', { delete: false }, ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
          expect(result.error.message).toContain('disabled');
        }
      });
    });
  });

  describe('Given access rule is a function that returns true', () => {
    describe('When enforceAccess is called', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('list', { list: () => true }, ctx);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toBeUndefined();
        }
      });
    });
  });

  describe('Given access rule is a function that returns false', () => {
    describe('When enforceAccess is called', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('list', { list: () => false }, ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given access rule that uses row parameter', () => {
    describe('When called with a matching row', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const rule = (_ctx: EntityContext, row: Record<string, unknown>) =>
          row.ownerId === _ctx.userId;

        const result = await enforceAccess('update', { update: rule }, ctx, { ownerId: 'user-1' });
        expect(result.ok).toBe(true);
      });
    });

    describe('When called with a non-matching row', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const rule = (_ctx: EntityContext, row: Record<string, unknown>) =>
          row.ownerId === _ctx.userId;

        const result = await enforceAccess('update', { update: rule }, ctx, { ownerId: 'user-2' });
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given a BaseContext (action context without entity/entities)', () => {
    describe('When enforceAccess is called with a BaseContext', () => {
      it('Then accepts BaseContext and evaluates the access rule', async () => {
        const baseCtx: BaseContext = {
          userId: 'user-1',
          tenantId: null,
          authenticated: () => true,
          tenant: () => false,
          role: () => false,
        };

        const result = await enforceAccess('login', { login: () => true }, baseCtx);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given access rule is rules.public', () => {
    describe('When enforceAccess is called', () => {
      it('Then returns ok(undefined) (always allows)', async () => {
        const ctx = stubCtx({ userId: null });

        const result = await enforceAccess('list', { list: rules.public }, ctx);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.data).toBeUndefined();
        }
      });
    });

    describe('When enforceAccess is called without authentication', () => {
      it('Then still returns ok(undefined)', async () => {
        const ctx = stubCtx({
          userId: null,
          authenticated: () => false,
        });

        const result = await enforceAccess('list', { list: rules.public }, ctx);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given access rule is rules.authenticated()', () => {
    describe('When user is not authenticated', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({ userId: null, authenticated: () => false });

        const result = await enforceAccess('list', { list: rules.authenticated() }, ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When user is authenticated', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('list', { list: rules.authenticated() }, ctx);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given access rule is rules.entitlement()', () => {
    describe('When options.can() returns true', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx();
        const options: EnforceAccessOptions = {
          can: async () => true,
        };

        const result = await enforceAccess(
          'update',
          { update: rules.entitlement('task:update') },
          ctx,
          {},
          options,
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When options.can() returns false', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx();
        const options: EnforceAccessOptions = {
          can: async () => false,
        };

        const result = await enforceAccess(
          'update',
          { update: rules.entitlement('task:update') },
          ctx,
          {},
          options,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When options.can is not provided', () => {
      it('Then returns err(EntityForbiddenError) (deny by default)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess(
          'update',
          { update: rules.entitlement('task:update') },
          ctx,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given access rule is rules.where() with user markers', () => {
    describe('When row matches rules.user.id', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });

        const result = await enforceAccess(
          'update',
          { update: rules.where({ createdBy: rules.user.id }) },
          ctx,
          { createdBy: 'user-1' },
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When row does not match rules.user.id', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });

        const result = await enforceAccess(
          'update',
          { update: rules.where({ createdBy: rules.user.id }) },
          ctx,
          { createdBy: 'user-2' },
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When row matches rules.user.tenantId', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx({ tenantId: 'tenant-a' });

        const result = await enforceAccess(
          'list',
          { list: rules.where({ tenantId: rules.user.tenantId }) },
          ctx,
          { tenantId: 'tenant-a' },
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When row does not match rules.user.tenantId', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({ tenantId: 'tenant-a' });

        const result = await enforceAccess(
          'list',
          { list: rules.where({ tenantId: rules.user.tenantId }) },
          ctx,
          { tenantId: 'tenant-b' },
        );
        expect(result.ok).toBe(false);
      });
    });

    describe('When where has a static condition', () => {
      it('Then matches the literal value', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess(
          'list',
          { list: rules.where({ status: 'published' }) },
          ctx,
          { status: 'published' },
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When where has multiple conditions', () => {
      it('Then all conditions must match', async () => {
        const ctx = stubCtx({ userId: 'user-1', tenantId: 'tenant-a' });

        const result = await enforceAccess(
          'update',
          {
            update: rules.where({
              createdBy: rules.user.id,
              tenantId: rules.user.tenantId,
            }),
          },
          ctx,
          { createdBy: 'user-1', tenantId: 'tenant-b' },
        );
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Given access rule is rules.all() (AND composition)', () => {
    describe('When all sub-rules pass', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const options: EnforceAccessOptions = { can: async () => true };

        const result = await enforceAccess(
          'update',
          {
            update: rules.all(
              rules.authenticated(),
              rules.entitlement('task:update'),
              rules.where({ createdBy: rules.user.id }),
            ),
          },
          ctx,
          { createdBy: 'user-1' },
          options,
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When one sub-rule fails', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const options: EnforceAccessOptions = { can: async () => false };

        const result = await enforceAccess(
          'update',
          {
            update: rules.all(rules.authenticated(), rules.entitlement('task:update')),
          },
          ctx,
          {},
          options,
        );
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Given access rule is rules.any() (OR composition)', () => {
    describe('When one sub-rule passes', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx({ userId: null, authenticated: () => false });

        const result = await enforceAccess(
          'list',
          {
            list: rules.any(rules.authenticated(), rules.public),
          },
          ctx,
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When all sub-rules fail', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({
          userId: null,
          authenticated: () => false,
          role: () => false,
        });

        const result = await enforceAccess(
          'list',
          {
            list: rules.any(rules.authenticated(), rules.role('admin')),
          },
          ctx,
        );
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Given access rule is rules.fva()', () => {
    describe('When fvaAge is within maxAge', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess(
          'delete',
          { delete: rules.fva(600) },
          ctx,
          {},
          { fvaAge: 300 },
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When fvaAge exceeds maxAge', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess(
          'delete',
          { delete: rules.fva(600) },
          ctx,
          {},
          { fvaAge: 700 },
        );
        expect(result.ok).toBe(false);
      });
    });

    describe('When fvaAge is not provided', () => {
      it('Then returns err(EntityForbiddenError) (deny by default)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('delete', { delete: rules.fva(600) }, ctx);
        expect(result.ok).toBe(false);
      });
    });
  });

  describe('Given access rule is rules.role()', () => {
    describe('When user does not have the role', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx({ role: () => false });

        const result = await enforceAccess('list', { list: rules.role('admin') }, ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When user has one of the roles', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx({ role: (...r: string[]) => r.includes('admin') });

        const result = await enforceAccess('list', { list: rules.role('admin', 'owner') }, ctx);
        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given access rule is an async function', () => {
    describe('When it resolves to true', () => {
      it('Then returns ok(undefined)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('list', { list: async () => true }, ctx);
        expect(result.ok).toBe(true);
      });
    });

    describe('When it resolves to false', () => {
      it('Then returns err(EntityForbiddenError)', async () => {
        const ctx = stubCtx();

        const result = await enforceAccess('list', { list: async () => false }, ctx);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given access rule is rules.where() with skipWhere option', () => {
    describe('When enforceAccess is called with skipWhere: true', () => {
      it('Then where rules are treated as ok (already enforced at DB level)', async () => {
        const ctx = stubCtx({ userId: 'user-1' });

        const result = await enforceAccess(
          'list',
          { list: rules.where({ createdBy: rules.user.id }) },
          ctx,
          {},
          { skipWhere: true },
        );
        expect(result.ok).toBe(true);
      });
    });

    describe('When enforceAccess has all() with where and authenticated, and user is unauthenticated', () => {
      it('Then the authenticated rule is still enforced', async () => {
        const ctx = stubCtx({ userId: null, authenticated: () => false });

        const result = await enforceAccess(
          'list',
          { list: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })) },
          ctx,
          {},
          { skipWhere: true },
        );
        expect(result.ok).toBe(false);
      });
    });
  });
});

describe('Feature: extractWhereConditions', () => {
  describe('Given access rule is rules.where() with static condition', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then returns the static conditions', () => {
        const ctx = stubCtx();
        const result = extractWhereConditions(
          'list',
          { list: rules.where({ status: 'published' }) },
          ctx,
        );
        expect(result).toEqual({ status: 'published' });
      });
    });
  });

  describe('Given access rule is rules.where() with user markers', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then resolves markers to context values', () => {
        const ctx = stubCtx({ userId: 'user-42', tenantId: 'tenant-x' });
        const result = extractWhereConditions(
          'list',
          { list: rules.where({ createdBy: rules.user.id, tenantId: rules.user.tenantId }) },
          ctx,
        );
        expect(result).toEqual({ createdBy: 'user-42', tenantId: 'tenant-x' });
      });
    });
  });

  describe('Given access rule is rules.all() containing a where rule', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then extracts where conditions from the all() composition', () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const result = extractWhereConditions(
          'list',
          { list: rules.all(rules.authenticated(), rules.where({ createdBy: rules.user.id })) },
          ctx,
        );
        expect(result).toEqual({ createdBy: 'user-1' });
      });
    });
  });

  describe('Given access rule is rules.authenticated() (no where)', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then returns null', () => {
        const ctx = stubCtx();
        const result = extractWhereConditions('list', { list: rules.authenticated() }, ctx);
        expect(result).toBeNull();
      });
    });
  });

  describe('Given access rule is a function', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then returns null (opaque function)', () => {
        const ctx = stubCtx();
        const result = extractWhereConditions('list', { list: () => true }, ctx);
        expect(result).toBeNull();
      });
    });
  });

  describe('Given no access rule for the operation', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then returns null', () => {
        const ctx = stubCtx();
        const result = extractWhereConditions('list', {}, ctx);
        expect(result).toBeNull();
      });
    });
  });

  describe('Given access rule is false (disabled)', () => {
    describe('When extractWhereConditions is called', () => {
      it('Then returns null', () => {
        const ctx = stubCtx();
        const result = extractWhereConditions('list', { list: false }, ctx);
        expect(result).toBeNull();
      });
    });
  });
});
