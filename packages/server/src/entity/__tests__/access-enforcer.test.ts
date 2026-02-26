import { describe, expect, it } from 'bun:test';
import { EntityForbiddenError } from '@vertz/errors';
import { enforceAccess } from '../access-enforcer';
import type { EntityContext } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubCtx(overrides: Partial<EntityContext> = {}): EntityContext {
  return {
    userId: 'user-1',
    authenticated: () => true,
    tenant: () => false,
    role: () => false,
    // biome-ignore lint/suspicious/noExplicitAny: stub for testing
    entity: {} as any,
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
});
