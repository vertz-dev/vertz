import { describe, expect, it } from 'bun:test';
import { createActionContext } from '../context';

describe('Feature: createActionContext', () => {
  describe('Given request info with userId', () => {
    describe('When creating an action context', () => {
      it('Then context has userId and authenticated() returns true', () => {
        const ctx = createActionContext({ userId: 'user-1', roles: ['admin'] }, {});

        expect(ctx.userId).toBe('user-1');
        expect(ctx.authenticated()).toBe(true);
      });
    });
  });

  describe('Given request info without userId', () => {
    describe('When creating an action context', () => {
      it('Then authenticated() returns false', () => {
        const ctx = createActionContext({}, {});

        expect(ctx.userId).toBeNull();
        expect(ctx.authenticated()).toBe(false);
      });
    });
  });

  describe('Given request info with roles', () => {
    describe('When checking role()', () => {
      it('Then returns true for matching role', () => {
        const ctx = createActionContext({ userId: 'user-1', roles: ['admin', 'editor'] }, {});

        expect(ctx.role('admin')).toBe(true);
        expect(ctx.role('editor')).toBe(true);
        expect(ctx.role('viewer')).toBe(false);
      });
    });
  });

  describe('Given request info with tenantId', () => {
    describe('When checking tenant()', () => {
      it('Then returns true when tenantId is set', () => {
        const ctx = createActionContext({ userId: 'user-1', tenantId: 'tenant-1' }, {});

        expect(ctx.tenant()).toBe(true);
      });

      it('Then returns false when tenantId is not set', () => {
        const ctx = createActionContext({ userId: 'user-1' }, {});

        expect(ctx.tenant()).toBe(false);
      });
    });
  });

  describe('Given a registry proxy', () => {
    describe('When accessing ctx.entities', () => {
      it('Then returns the registry proxy', () => {
        const proxy = { users: { get: () => {} } };
        const ctx = createActionContext({ userId: 'user-1' }, proxy);

        expect(ctx.entities).toBe(proxy);
      });
    });
  });
});
