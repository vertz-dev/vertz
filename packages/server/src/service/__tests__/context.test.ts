import { describe, expect, it } from '@vertz/test';
import { createServiceContext } from '../context';

describe('Feature: createServiceContext', () => {
  describe('Given request info with userId', () => {
    describe('When creating a service context', () => {
      it('Then context has userId and authenticated() returns true', () => {
        const ctx = createServiceContext({ userId: 'user-1', roles: ['admin'] }, {});

        expect(ctx.userId).toBe('user-1');
        expect(ctx.authenticated()).toBe(true);
      });
    });
  });

  describe('Given request info without userId', () => {
    describe('When creating a service context', () => {
      it('Then authenticated() returns false', () => {
        const ctx = createServiceContext({}, {});

        expect(ctx.userId).toBeNull();
        expect(ctx.authenticated()).toBe(false);
      });
    });
  });

  describe('Given request info with roles', () => {
    describe('When checking role()', () => {
      it('Then returns true for matching role', () => {
        const ctx = createServiceContext({ userId: 'user-1', roles: ['admin', 'editor'] }, {});

        expect(ctx.role('admin')).toBe(true);
        expect(ctx.role('editor')).toBe(true);
        expect(ctx.role('viewer')).toBe(false);
      });
    });
  });

  describe('Given request info with tenantId', () => {
    describe('When checking tenant()', () => {
      it('Then returns true when tenantId is set', () => {
        const ctx = createServiceContext({ userId: 'user-1', tenantId: 'tenant-1' }, {});

        expect(ctx.tenant()).toBe(true);
      });

      it('Then returns false when tenantId is not set', () => {
        const ctx = createServiceContext({ userId: 'user-1' }, {});

        expect(ctx.tenant()).toBe(false);
      });
    });
  });

  describe('Given a registry proxy', () => {
    describe('When accessing ctx.entities', () => {
      it('Then returns the registry proxy', () => {
        const proxy = { users: { get: () => {} } };
        const ctx = createServiceContext({ userId: 'user-1' }, proxy);

        expect(ctx.entities).toBe(proxy);
      });
    });
  });

  describe('Given a rawRequest with params', () => {
    describe('When accessing ctx.request.params', () => {
      it('Then returns the path params', () => {
        const ctx = createServiceContext(
          { userId: 'user-1' },
          {},
          {
            url: 'http://localhost/api/auth/callback/github',
            method: 'GET',
            headers: new Headers(),
            body: undefined,
            params: { provider: 'github' },
          },
        );

        expect(ctx.request.params).toEqual({ provider: 'github' });
      });
    });
  });

  describe('Given a rawRequest without params (defensive fallback)', () => {
    describe('When accessing ctx.request.params', () => {
      it('Then returns an empty object', () => {
        // Tests defensive fallback — rawRequest.params may be undefined from untyped callers
        const ctx = createServiceContext(
          { userId: 'user-1' },
          {},
          {
            url: 'http://localhost/api/auth/login',
            method: 'POST',
            headers: new Headers(),
            body: undefined,
            params: undefined as never,
          },
        );

        expect(ctx.request.params).toEqual({});
      });
    });
  });

  describe('Given no rawRequest', () => {
    describe('When accessing ctx.request.params', () => {
      it('Then returns an empty object', () => {
        const ctx = createServiceContext({ userId: 'user-1' }, {});

        expect(ctx.request.params).toEqual({});
      });
    });
  });
});
