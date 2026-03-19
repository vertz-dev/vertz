import { describe, expect, it } from 'bun:test';
import { rules } from '../../auth/rules';
import { evaluateExposeDescriptors } from '../expose-evaluator';
import type { BaseContext } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stubCtx(overrides: Partial<BaseContext> = {}): BaseContext {
  return {
    userId: 'user-1',
    tenantId: null,
    authenticated: () => true,
    tenant: () => false,
    role: () => false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: evaluateExposeDescriptors', () => {
  describe('Given expose.select with all `true` values', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then all fields are in allowedSelectFields and none in nulledFields', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, name: true, email: true } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'name', 'email']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });
  });

  describe('Given expose.select with a descriptor the user satisfies', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is in allowedSelectFields and not in nulledFields', async () => {
        const ctx = stubCtx({ authenticated: () => true });
        const expose = {
          select: {
            id: true,
            salary: rules.authenticated(),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'salary']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });
  });

  describe('Given expose.select with a descriptor the user does NOT satisfy', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is in allowedSelectFields AND in nulledFields', async () => {
        const ctx = stubCtx({ authenticated: () => false });
        const expose = {
          select: {
            id: true,
            salary: rules.authenticated(),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'salary']));
        expect(result.nulledFields).toEqual(new Set(['salary']));
      });
    });
  });

  describe('Given expose.select with entitlement descriptor', () => {
    describe('When user has the entitlement', () => {
      it('Then the field is allowed and not nulled', async () => {
        const ctx = stubCtx();
        const expose = {
          select: {
            id: true,
            salary: rules.entitlement('hr:view'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async (ent) => ent === 'hr:view',
        });

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'salary']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });

    describe('When user lacks the entitlement', () => {
      it('Then the field is nulled', async () => {
        const ctx = stubCtx();
        const expose = {
          select: {
            id: true,
            salary: rules.entitlement('hr:view'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async () => false,
        });

        expect(result.nulledFields).toEqual(new Set(['salary']));
      });
    });
  });

  describe('Given expose.allowWhere with all `true` values', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then all fields are in allowedWhereFields', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, status: true } as Record<string, true | object>,
          allowWhere: { status: true } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedWhereFields).toEqual(new Set(['status']));
      });
    });
  });

  describe('Given expose.allowWhere with a descriptor the user satisfies', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is in allowedWhereFields', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, salary: true } as Record<string, true | object>,
          allowWhere: {
            salary: rules.entitlement('hr:filter'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async (ent) => ent === 'hr:filter',
        });

        expect(result.allowedWhereFields).toEqual(new Set(['salary']));
      });
    });
  });

  describe('Given expose.allowWhere with a descriptor the user does NOT satisfy', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is NOT in allowedWhereFields', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, salary: true } as Record<string, true | object>,
          allowWhere: {
            salary: rules.entitlement('hr:filter'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async () => false,
        });

        expect(result.allowedWhereFields).toEqual(new Set());
      });
    });
  });

  describe('Given expose.allowOrderBy with all `true` values', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then all fields are in allowedOrderByFields', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, name: true } as Record<string, true | object>,
          allowOrderBy: { name: true } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedOrderByFields).toEqual(new Set(['name']));
      });
    });
  });

  describe('Given expose.allowOrderBy with a descriptor the user does NOT satisfy', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is NOT in allowedOrderByFields', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, salary: true } as Record<string, true | object>,
          allowOrderBy: {
            salary: rules.entitlement('hr:sort'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async () => false,
        });

        expect(result.allowedOrderByFields).toEqual(new Set());
      });
    });
  });

  describe('Given no expose.allowWhere or expose.allowOrderBy', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then allowedWhereFields and allowedOrderByFields are empty', async () => {
        const ctx = stubCtx();
        const expose = {
          select: { id: true, name: true } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedWhereFields).toEqual(new Set());
        expect(result.allowedOrderByFields).toEqual(new Set());
      });
    });
  });

  describe('Given expose.select with rules.public descriptor', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is allowed (public always passes)', async () => {
        const ctx = stubCtx({ authenticated: () => false });
        const expose = {
          select: {
            id: true,
            status: rules.public,
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'status']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });
  });

  describe('Given expose.select with rules.role() descriptor', () => {
    describe('When the user has the role', () => {
      it('Then the field is allowed', async () => {
        const ctx = stubCtx({ role: (...roles: string[]) => roles.includes('admin') });
        const expose = {
          select: {
            id: true,
            secret: rules.role('admin'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'secret']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });

    describe('When the user does NOT have the role', () => {
      it('Then the field is nulled', async () => {
        const ctx = stubCtx({ role: () => false });
        const expose = {
          select: {
            id: true,
            secret: rules.role('admin'),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.nulledFields).toEqual(new Set(['secret']));
      });
    });
  });

  describe('Given expose.select with entitlement descriptor but no options.can', () => {
    describe('When evaluateExposeDescriptors is called without can option', () => {
      it('Then the field is nulled (entitlement check returns false)', async () => {
        const ctx = stubCtx();
        const expose = {
          select: {
            id: true,
            salary: rules.entitlement('hr:view'),
          } as Record<string, true | object>,
        };

        // No options.can provided
        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.nulledFields).toEqual(new Set(['salary']));
      });
    });
  });

  describe('Given expose.select with rules.where() descriptor', () => {
    describe('When evaluateExposeDescriptors is called', () => {
      it('Then the field is nulled (where rules are not applicable in expose context)', async () => {
        const ctx = stubCtx();
        const expose = {
          select: {
            id: true,
            owned: rules.where({ createdBy: rules.user.id }),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.nulledFields).toEqual(new Set(['owned']));
      });
    });
  });

  describe('Given expose.select with rules.any() composed descriptor', () => {
    describe('When at least one sub-rule passes', () => {
      it('Then the field is allowed', async () => {
        const ctx = stubCtx({ role: (...roles: string[]) => roles.includes('admin') });
        const expose = {
          select: {
            id: true,
            mixed: rules.any(rules.role('admin'), rules.entitlement('special')),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'mixed']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });

    describe('When no sub-rules pass', () => {
      it('Then the field is nulled', async () => {
        const ctx = stubCtx({ authenticated: () => false, role: () => false });
        const expose = {
          select: {
            id: true,
            mixed: rules.any(rules.role('admin'), rules.authenticated()),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx);

        expect(result.nulledFields).toEqual(new Set(['mixed']));
      });
    });
  });

  describe('Given expose.select with rules.all() composed descriptor', () => {
    describe('When all sub-rules pass', () => {
      it('Then the field is allowed and not nulled', async () => {
        const ctx = stubCtx();
        const expose = {
          select: {
            id: true,
            ssn: rules.all(rules.entitlement('hr:view-pii'), rules.fva(300)),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async () => true,
          fvaAge: 100,
        });

        expect(result.allowedSelectFields).toEqual(new Set(['id', 'ssn']));
        expect(result.nulledFields).toEqual(new Set());
      });
    });

    describe('When one sub-rule fails', () => {
      it('Then the field is nulled', async () => {
        const ctx = stubCtx();
        const expose = {
          select: {
            id: true,
            ssn: rules.all(rules.entitlement('hr:view-pii'), rules.fva(300)),
          } as Record<string, true | object>,
        };

        const result = await evaluateExposeDescriptors(expose, ctx, {
          can: async () => true,
          fvaAge: 500, // exceeds maxAge of 300
        });

        expect(result.nulledFields).toEqual(new Set(['ssn']));
      });
    });
  });
});
