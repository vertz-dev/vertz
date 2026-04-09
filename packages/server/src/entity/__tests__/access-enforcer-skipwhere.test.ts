/**
 * Access Enforcer skipWhere Edge Cases — Coverage hardening for entity/access-enforcer.ts
 * Tests: unknown user marker, any() with skipWhere, function rules with skipWhere
 */

import { describe, expect, it } from '@vertz/test';
import { EntityForbiddenError } from '@vertz/errors';
import type { UserMarker } from '../../auth/rules';
import { rules } from '../../auth/rules';
import { enforceAccess } from '../access-enforcer';
import type { EntityContext } from '../types';

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

describe('Access Enforcer skipWhere Edge Cases', () => {
  describe('Given a where rule with an unknown user marker', () => {
    describe('When enforceAccess is called', () => {
      it('Then resolves the marker to undefined and denies access (line 35)', async () => {
        const ctx = stubCtx();
        const unknownMarker = { __marker: 'user.unknown' } as UserMarker;
        const rule = rules.where({ createdBy: unknownMarker });

        const result = await enforceAccess('update', { update: rule }, ctx, {
          createdBy: 'user-1',
        });

        // Unknown marker resolves to undefined, which !== 'user-1', so denied
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given an any() rule with skipWhere containing a where sub-rule and role sub-rule', () => {
    describe('When enforceAccess is called with skipWhere: true and row matches where', () => {
      it('Then the where sub-rule is evaluated in-memory (NOT skipped) and any() passes via where match', async () => {
        const ctx = stubCtx();
        const rule = rules.any(rules.where({ createdBy: rules.user.id }), rules.role('admin'));

        // Row matches where condition — evaluated in-memory, not skipped
        const result = await enforceAccess(
          'list',
          { list: rule },
          ctx,
          { createdBy: 'user-1' },
          { skipWhere: true },
        );

        expect(result.ok).toBe(true);
      });
    });

    describe('When enforceAccess is called with skipWhere: true and row does NOT match where', () => {
      it('Then the where sub-rule is evaluated in-memory and denies (not blindly skipped)', async () => {
        const ctx = stubCtx({ role: () => false });
        const rule = rules.any(rules.where({ createdBy: rules.user.id }), rules.role('admin'));

        // Row does NOT match where, and user is not admin — both branches fail
        const result = await enforceAccess(
          'list',
          { list: rule },
          ctx,
          { createdBy: 'other-user' },
          { skipWhere: true },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  describe('Given an any() rule with skipWhere where all sub-rules fail', () => {
    describe('When enforceAccess is called with skipWhere: true', () => {
      it('Then returns deny (lines 138-139)', async () => {
        const ctx = stubCtx({ role: () => false });
        const rule = rules.any(rules.entitlement('admin:manage'), rules.role('admin'));

        const result = await enforceAccess(
          'delete',
          { delete: rule },
          ctx,
          {},
          { skipWhere: true },
        );

        // Both sub-rules fail (no entitlement evaluator, no admin role), deny
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });

  // --- BLOCKER-1 regression test: all(where, any(where, entitlement)) with skipWhere ---

  describe('Given all(where({status}), any(where({visibility}), entitlement)) with skipWhere', () => {
    describe('When row matches the all-level where but NOT the any-level where, and user lacks entitlement', () => {
      it('Then denies access (where inside any is evaluated in-memory, not skipped)', async () => {
        const ctx = stubCtx({ role: () => false });
        const rule = rules.all(
          rules.where({ status: 'published' }),
          rules.any(rules.where({ visibility: 'public' }), rules.entitlement('content:read')),
        );

        // Row has status: 'published' (matches all-level where, pushed to DB)
        // But visibility: 'private' (does NOT match any-level where)
        // And no entitlement evaluator (no `can` option)
        const result = await enforceAccess(
          'get',
          { get: rule },
          ctx,
          { status: 'published', visibility: 'private' },
          { skipWhere: true },
        );

        // Must deny: the any-level where({visibility: 'public'}) fails in-memory,
        // and the entitlement also fails. Before the fix, this would incorrectly
        // pass because skipWhere would blindly skip the where inside any.
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });

    describe('When row matches both all-level and any-level where conditions', () => {
      it('Then allows access via the any-level where match (evaluated in-memory)', async () => {
        const ctx = stubCtx();
        const rule = rules.all(
          rules.where({ status: 'published' }),
          rules.any(rules.where({ visibility: 'public' }), rules.entitlement('content:read')),
        );

        const result = await enforceAccess(
          'get',
          { get: rule },
          ctx,
          { status: 'published', visibility: 'public' },
          { skipWhere: true },
        );

        expect(result.ok).toBe(true);
      });
    });
  });

  describe('Given a function rule with skipWhere', () => {
    describe('When the function returns true', () => {
      it('Then evaluates the function normally and allows access (lines 151-153)', async () => {
        const ctx = stubCtx();
        const rule = () => true;

        const result = await enforceAccess('get', { get: rule }, ctx, {}, { skipWhere: true });

        expect(result.ok).toBe(true);
      });
    });

    describe('When the function returns false', () => {
      it('Then evaluates the function normally and denies access (lines 151-153)', async () => {
        const ctx = stubCtx();
        const rule = () => false;

        const result = await enforceAccess('get', { get: rule }, ctx, {}, { skipWhere: true });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(EntityForbiddenError);
        }
      });
    });
  });
});
