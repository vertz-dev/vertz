import { ForbiddenException } from '@vertz/core';
import { describe, expect, it } from 'bun:test';
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
      it('Then throws ForbiddenException (deny by default)', async () => {
        const ctx = stubCtx();

        await expect(enforceAccess('create', {}, ctx)).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('Given access rule is false (disabled)', () => {
    describe('When enforceAccess is called', () => {
      it('Then throws ForbiddenException with "disabled" message', async () => {
        const ctx = stubCtx();

        await expect(enforceAccess('delete', { delete: false }, ctx)).rejects.toThrow(/disabled/);
      });
    });
  });

  describe('Given access rule is a function that returns true', () => {
    describe('When enforceAccess is called', () => {
      it('Then does not throw', async () => {
        const ctx = stubCtx();

        await expect(enforceAccess('list', { list: () => true }, ctx)).resolves.toBeUndefined();
      });
    });
  });

  describe('Given access rule is a function that returns false', () => {
    describe('When enforceAccess is called', () => {
      it('Then throws ForbiddenException', async () => {
        const ctx = stubCtx();

        await expect(enforceAccess('list', { list: () => false }, ctx)).rejects.toThrow(
          ForbiddenException,
        );
      });
    });
  });

  describe('Given access rule that uses row parameter', () => {
    describe('When called with a matching row', () => {
      it('Then does not throw', async () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const rule = (_ctx: EntityContext, row: Record<string, unknown>) =>
          row.ownerId === _ctx.userId;

        await expect(
          enforceAccess('update', { update: rule }, ctx, { ownerId: 'user-1' }),
        ).resolves.toBeUndefined();
      });
    });

    describe('When called with a non-matching row', () => {
      it('Then throws ForbiddenException', async () => {
        const ctx = stubCtx({ userId: 'user-1' });
        const rule = (_ctx: EntityContext, row: Record<string, unknown>) =>
          row.ownerId === _ctx.userId;

        await expect(
          enforceAccess('update', { update: rule }, ctx, { ownerId: 'user-2' }),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('Given access rule is an async function', () => {
    describe('When it resolves to true', () => {
      it('Then does not throw', async () => {
        const ctx = stubCtx();

        await expect(
          enforceAccess('list', { list: async () => true }, ctx),
        ).resolves.toBeUndefined();
      });
    });

    describe('When it resolves to false', () => {
      it('Then throws ForbiddenException', async () => {
        const ctx = stubCtx();

        await expect(enforceAccess('list', { list: async () => false }, ctx)).rejects.toThrow(
          ForbiddenException,
        );
      });
    });
  });
});
