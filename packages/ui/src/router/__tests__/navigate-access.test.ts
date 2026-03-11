import { beforeEach, describe, expect, it, vi } from 'bun:test';
import { rules } from '../../auth/route-rules';
import { defineRoutes } from '../define-routes';
import { createRouter } from '../navigate';

describe('client-side route access', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('allows navigation to public route (no access field)', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/about': { component: () => document.createElement('div') },
    });
    const onAccessDenied = vi.fn();
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => false,
        role: () => false,
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied,
    });

    await router.navigate({ to: '/about' });
    expect(onAccessDenied).not.toHaveBeenCalled();
    expect(router.current.value?.route.pattern).toBe('/about');
  });

  it('calls onAccessDenied when navigating to denied route', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': {
        component: () => document.createElement('div'),
        access: rules.authenticated(),
      },
    });
    const onAccessDenied = vi.fn();
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => false,
        role: () => false,
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied,
    });

    await router.navigate({ to: '/dashboard' });
    expect(onAccessDenied).toHaveBeenCalledWith('not_authenticated');
  });

  it('does not update current route when access is denied', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': {
        component: () => document.createElement('div'),
        access: rules.authenticated(),
      },
    });
    const onAccessDenied = vi.fn();
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => false,
        role: () => false,
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied,
    });

    await router.navigate({ to: '/dashboard' });
    // Current route should still be '/', not '/dashboard'
    expect(router.current.value?.route.pattern).toBe('/');
  });

  it('does not execute loaders when access is denied', async () => {
    const loader = vi.fn().mockResolvedValue({ data: 'secret' });
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': {
        component: () => document.createElement('div'),
        access: rules.authenticated(),
        loader,
      },
    });
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => false,
        role: () => false,
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied: () => {},
    });

    await router.navigate({ to: '/dashboard' });
    expect(loader).not.toHaveBeenCalled();
  });

  it('allows navigation when access check passes', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': {
        component: () => document.createElement('div'),
        access: rules.authenticated(),
      },
    });
    const onAccessDenied = vi.fn();
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => true,
        role: () => false,
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied,
    });

    await router.navigate({ to: '/dashboard' });
    expect(onAccessDenied).not.toHaveBeenCalled();
    expect(router.current.value?.route.pattern).toBe('/dashboard');
  });

  it('checks parent access for nested routes', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/admin': {
        component: () => document.createElement('div'),
        access: rules.role('admin'),
        children: {
          '/users': { component: () => document.createElement('div') },
        },
      },
    });
    const onAccessDenied = vi.fn();
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => true,
        role: () => false, // not admin
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied,
    });

    await router.navigate({ to: '/admin/users' });
    expect(onAccessDenied).toHaveBeenCalledWith('role_denied');
  });

  it('checks access on popstate (back/forward) navigation', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': {
        component: () => document.createElement('div'),
        access: rules.authenticated(),
      },
    });
    const onAccessDenied = vi.fn();
    // Start authenticated
    const isAuthenticated = { value: true };
    const router = createRouter(routes, '/', {
      accessAuth: () => ({
        authenticated: () => isAuthenticated.value,
        role: () => false,
        can: () => false,
        fvaAge: undefined,
      }),
      onAccessDenied,
    });

    // Navigate to dashboard (allowed)
    await router.navigate({ to: '/dashboard' });
    expect(router.current.value?.route.pattern).toBe('/dashboard');

    // Navigate elsewhere
    await router.navigate({ to: '/' });

    // Simulate losing auth
    isAuthenticated.value = false;

    // Simulate back button to /dashboard — should trigger access check
    window.history.pushState(null, '', '/dashboard');
    window.dispatchEvent(new PopStateEvent('popstate'));

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 50));
    expect(onAccessDenied).toHaveBeenCalledWith('not_authenticated');
  });

  it('works without accessAuth (no access checking)', async () => {
    const routes = defineRoutes({
      '/': { component: () => document.createElement('div') },
      '/dashboard': {
        component: () => document.createElement('div'),
        access: rules.authenticated(),
      },
    });
    // No accessAuth provided — access rules are ignored
    const router = createRouter(routes, '/');

    await router.navigate({ to: '/dashboard' });
    expect(router.current.value?.route.pattern).toBe('/dashboard');
  });
});
