import { describe, expect, it } from 'bun:test';
import { rules } from '../../auth/route-rules';
import { defineRoutes, matchRoute } from '../define-routes';
import type { RouteAccessContext } from '../route-access';
import { evaluateRouteAccess } from '../route-access';

function makeCtx(overrides: Partial<RouteAccessContext> = {}): RouteAccessContext {
  return {
    authenticated: () => false,
    role: () => false,
    can: () => false,
    fvaAge: undefined,
    ...overrides,
  };
}

describe('evaluateRouteAccess', () => {
  it('allows access when no access rules are defined (public by default)', () => {
    const routes = defineRoutes({
      '/': { component: () => null as unknown as Node },
    });
    const match = matchRoute(routes, '/');
    const result = evaluateRouteAccess(match!.matched, makeCtx());
    expect(result.allowed).toBe(true);
  });

  it('allows access for rules.public', () => {
    const routes = defineRoutes({
      '/': { component: () => null as unknown as Node, access: rules.public },
    });
    const match = matchRoute(routes, '/');
    const result = evaluateRouteAccess(match!.matched, makeCtx());
    expect(result.allowed).toBe(true);
  });

  it('denies unauthenticated user for rules.authenticated()', () => {
    const routes = defineRoutes({
      '/dash': { component: () => null as unknown as Node, access: rules.authenticated() },
    });
    const match = matchRoute(routes, '/dash');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ authenticated: () => false }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not_authenticated');
  });

  it('allows authenticated user for rules.authenticated()', () => {
    const routes = defineRoutes({
      '/dash': { component: () => null as unknown as Node, access: rules.authenticated() },
    });
    const match = matchRoute(routes, '/dash');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ authenticated: () => true }));
    expect(result.allowed).toBe(true);
  });

  it('denies wrong role for rules.role()', () => {
    const routes = defineRoutes({
      '/admin': { component: () => null as unknown as Node, access: rules.role('admin') },
    });
    const match = matchRoute(routes, '/admin');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ role: () => false }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('role_denied');
  });

  it('allows matching role for rules.role()', () => {
    const routes = defineRoutes({
      '/admin': { component: () => null as unknown as Node, access: rules.role('admin') },
    });
    const match = matchRoute(routes, '/admin');
    const result = evaluateRouteAccess(
      match!.matched,
      makeCtx({ role: (...roles) => roles.includes('admin') }),
    );
    expect(result.allowed).toBe(true);
  });

  it('denies missing entitlement for rules.entitlement()', () => {
    const routes = defineRoutes({
      '/billing': {
        component: () => null as unknown as Node,
        access: rules.entitlement('admin:billing'),
      },
    });
    const match = matchRoute(routes, '/billing');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ can: () => false }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('entitlement_denied');
  });

  it('allows matching entitlement for rules.entitlement()', () => {
    const routes = defineRoutes({
      '/billing': {
        component: () => null as unknown as Node,
        access: rules.entitlement('admin:billing'),
      },
    });
    const match = matchRoute(routes, '/billing');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ can: () => true }));
    expect(result.allowed).toBe(true);
  });

  it('denies when fvaAge exceeds maxAge for rules.fva()', () => {
    const routes = defineRoutes({
      '/secure': { component: () => null as unknown as Node, access: rules.fva(600) },
    });
    const match = matchRoute(routes, '/secure');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ fvaAge: 700 }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('fva_required');
  });

  it('denies when fvaAge is undefined for rules.fva()', () => {
    const routes = defineRoutes({
      '/secure': { component: () => null as unknown as Node, access: rules.fva(600) },
    });
    const match = matchRoute(routes, '/secure');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ fvaAge: undefined }));
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('fva_required');
  });

  it('allows when fvaAge is within maxAge for rules.fva()', () => {
    const routes = defineRoutes({
      '/secure': { component: () => null as unknown as Node, access: rules.fva(600) },
    });
    const match = matchRoute(routes, '/secure');
    const result = evaluateRouteAccess(match!.matched, makeCtx({ fvaAge: 300 }));
    expect(result.allowed).toBe(true);
  });

  it('denies when any sub-rule fails in rules.all()', () => {
    const routes = defineRoutes({
      '/settings': {
        component: () => null as unknown as Node,
        access: rules.all(rules.authenticated(), rules.role('admin')),
      },
    });
    const match = matchRoute(routes, '/settings');
    // authenticated but not admin
    const result = evaluateRouteAccess(
      match!.matched,
      makeCtx({ authenticated: () => true, role: () => false }),
    );
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('role_denied');
  });

  it('allows when all sub-rules pass in rules.all()', () => {
    const routes = defineRoutes({
      '/settings': {
        component: () => null as unknown as Node,
        access: rules.all(rules.authenticated(), rules.role('admin')),
      },
    });
    const match = matchRoute(routes, '/settings');
    const result = evaluateRouteAccess(
      match!.matched,
      makeCtx({ authenticated: () => true, role: (...roles) => roles.includes('admin') }),
    );
    expect(result.allowed).toBe(true);
  });

  it('allows when any sub-rule passes in rules.any()', () => {
    const routes = defineRoutes({
      '/page': {
        component: () => null as unknown as Node,
        access: rules.any(rules.role('admin'), rules.entitlement('page:view')),
      },
    });
    const match = matchRoute(routes, '/page');
    // not admin but has entitlement
    const result = evaluateRouteAccess(
      match!.matched,
      makeCtx({ role: () => false, can: () => true }),
    );
    expect(result.allowed).toBe(true);
  });

  it('denies when all sub-rules fail in rules.any()', () => {
    const routes = defineRoutes({
      '/page': {
        component: () => null as unknown as Node,
        access: rules.any(rules.role('admin'), rules.entitlement('page:view')),
      },
    });
    const match = matchRoute(routes, '/page');
    const result = evaluateRouteAccess(
      match!.matched,
      makeCtx({ role: () => false, can: () => false }),
    );
    expect(result.allowed).toBe(false);
  });

  describe('parent access cascading', () => {
    it('denies child route when parent access fails', () => {
      const routes = defineRoutes({
        '/admin': {
          component: () => null as unknown as Node,
          access: rules.role('admin'),
          children: {
            '/users': { component: () => null as unknown as Node },
          },
        },
      });
      const match = matchRoute(routes, '/admin/users');
      const result = evaluateRouteAccess(match!.matched, makeCtx({ role: () => false }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('role_denied');
    });

    it('allows child when parent access passes and child has no access', () => {
      const routes = defineRoutes({
        '/admin': {
          component: () => null as unknown as Node,
          access: rules.role('admin'),
          children: {
            '/users': { component: () => null as unknown as Node },
          },
        },
      });
      const match = matchRoute(routes, '/admin/users');
      const result = evaluateRouteAccess(
        match!.matched,
        makeCtx({ role: (...roles) => roles.includes('admin') }),
      );
      expect(result.allowed).toBe(true);
    });

    it('denies child when parent passes but child access fails', () => {
      const routes = defineRoutes({
        '/admin': {
          component: () => null as unknown as Node,
          access: rules.role('admin'),
          children: {
            '/billing': {
              component: () => null as unknown as Node,
              access: rules.entitlement('admin:billing'),
            },
          },
        },
      });
      const match = matchRoute(routes, '/admin/billing');
      const result = evaluateRouteAccess(
        match!.matched,
        makeCtx({ role: (...roles) => roles.includes('admin'), can: () => false }),
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('entitlement_denied');
    });

    it('allows child when both parent and child access pass', () => {
      const routes = defineRoutes({
        '/admin': {
          component: () => null as unknown as Node,
          access: rules.role('admin'),
          children: {
            '/billing': {
              component: () => null as unknown as Node,
              access: rules.entitlement('admin:billing'),
            },
          },
        },
      });
      const match = matchRoute(routes, '/admin/billing');
      const result = evaluateRouteAccess(
        match!.matched,
        makeCtx({
          role: (...roles) => roles.includes('admin'),
          can: () => true,
        }),
      );
      expect(result.allowed).toBe(true);
    });
  });
});
