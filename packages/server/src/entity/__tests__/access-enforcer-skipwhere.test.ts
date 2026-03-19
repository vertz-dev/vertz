/**
 * Access Enforcer skipWhere Edge Cases — Coverage hardening for entity/access-enforcer.ts
 * Tests: unknown user marker, any() with skipWhere, function rules with skipWhere
 */

import { describe, expect, it } from 'bun:test';
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

  describe('Given an any() rule with skipWhere containing a where sub-rule and authenticated sub-rule', () => {
    describe('When enforceAccess is called with skipWhere: true', () => {
      it('Then the where sub-rule is treated as ok() and any() passes (lines 134-137)', async () => {
        const ctx = stubCtx();
        const rule = rules.any(rules.where({ createdBy: rules.user.id }), rules.role('admin'));

        const result = await enforceAccess('list', { list: rule }, ctx, {}, { skipWhere: true });

        // where rule is skipped (treated as ok()), so any() passes via the where rule
        expect(result.ok).toBe(true);
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
