import { describe, expect, it } from 'bun:test';
import { defineRoutes, rules, type RouteAccessContext } from '@vertz/ui';
import { createSSRHandler } from '../ssr-handler';
import type { SSRModule } from '../ssr-render';

const simpleModule: SSRModule = {
  default: () => {
    const el = document.createElement('div');
    el.textContent = 'Protected Content';
    return el;
  },
};

const template = `<!DOCTYPE html>
<html>
<head><title>Test</title></head>
<body><div id="app"><!--ssr-outlet--></div></body>
</html>`;

const protectedRoutes = defineRoutes({
  '/': { component: () => null as unknown as Node },
  '/dashboard': {
    component: () => null as unknown as Node,
    access: rules.authenticated(),
  },
  '/admin': {
    component: () => null as unknown as Node,
    access: rules.role('admin'),
    children: {
      '/users': { component: () => null as unknown as Node },
      '/billing': {
        component: () => null as unknown as Node,
        access: rules.entitlement('admin:billing'),
      },
    },
  },
});

function makeAuthCtx(overrides: Partial<RouteAccessContext> = {}): RouteAccessContext {
  return {
    authenticated: () => false,
    role: () => false,
    can: () => false,
    fvaAge: undefined,
    ...overrides,
  };
}

describe('SSR handler with route access', () => {
  it('renders normally when no routes or auth config provided', async () => {
    const handler = createSSRHandler({ module: simpleModule, template });
    const response = await handler(new Request('http://localhost/dashboard'));
    expect(response.status).toBe(200);
  });

  it('renders public route regardless of auth state', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () => makeAuthCtx(),
        onDenied: () => '/login',
      },
    });
    const response = await handler(new Request('http://localhost/'));
    expect(response.status).toBe(200);
  });

  it('redirects unauthenticated user from protected route', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () => makeAuthCtx({ authenticated: () => false }),
        onDenied: (reason) => (reason === 'not_authenticated' ? '/login' : '/403'),
      },
    });
    const response = await handler(new Request('http://localhost/dashboard'));
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });

  it('renders protected route for authenticated user', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () => makeAuthCtx({ authenticated: () => true }),
        onDenied: () => '/login',
      },
    });
    const response = await handler(new Request('http://localhost/dashboard'));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('Protected Content');
  });

  it('redirects non-admin from role-protected route', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () => makeAuthCtx({ authenticated: () => true, role: () => false }),
        onDenied: () => '/403',
      },
    });
    const response = await handler(new Request('http://localhost/admin/users'));
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/403');
  });

  it('renders child route when parent access passes', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () =>
          makeAuthCtx({ authenticated: () => true, role: (...r) => r.includes('admin') }),
        onDenied: () => '/403',
      },
    });
    const response = await handler(new Request('http://localhost/admin/users'));
    expect(response.status).toBe(200);
  });

  it('redirects when child entitlement fails even if parent passes', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () =>
          makeAuthCtx({
            authenticated: () => true,
            role: (...r) => r.includes('admin'),
            can: () => false,
          }),
        onDenied: () => '/403',
      },
    });
    const response = await handler(new Request('http://localhost/admin/billing'));
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/403');
  });

  it('renders when route does not match (no access check, normal 404 flow)', async () => {
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: () => makeAuthCtx(),
        onDenied: () => '/login',
      },
    });
    const response = await handler(new Request('http://localhost/nonexistent'));
    // Non-matching URL bypasses access check, renders normally (404 handled by app)
    expect(response.status).toBe(200);
  });

  it('passes request to fromRequest for JWT extraction', async () => {
    let capturedRequest: Request | null = null;
    const handler = createSSRHandler({
      module: simpleModule,
      template,
      routes: protectedRoutes,
      auth: {
        fromRequest: (req) => {
          capturedRequest = req;
          return makeAuthCtx({ authenticated: () => true });
        },
        onDenied: () => '/login',
      },
    });
    const request = new Request('http://localhost/dashboard', {
      headers: { Cookie: 'token=abc123' },
    });
    await handler(request);
    expect(capturedRequest).toBe(request);
  });
});
