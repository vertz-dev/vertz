import { describe, expect, it } from 'bun:test';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import { collectRoutes, formatRouteLog, type RouteInfo } from '../route-log';

describe('collectRoutes', () => {
  it('returns an empty array when there are no registrations', () => {
    expect(collectRoutes('', [])).toEqual([]);
  });

  it('collects routes from module registrations with basePath and prefix', () => {
    const moduleDef = createModuleDef({ name: 'users' });
    const router = moduleDef.router({ prefix: '/users' });
    router.get('/', { handler: () => [] });
    router.post('/', { handler: () => ({}) });
    router.get('/:id', { handler: () => ({}) });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

    const routes = collectRoutes('/api', [{ module: mod }]);

    expect(routes).toEqual([
      { method: 'GET', path: '/api/users' },
      { method: 'POST', path: '/api/users' },
      { method: 'GET', path: '/api/users/:id' },
    ]);
  });

  it('normalizes trailing slashes on root routes', () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/items' });
    router.get('/', { handler: () => [] });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

    const routes = collectRoutes('', [{ module: mod }]);

    expect(routes).toEqual([{ method: 'GET', path: '/items' }]);
  });

  it('handles basePath "/" without producing double slashes', () => {
    const moduleDef = createModuleDef({ name: 'users' });
    const router = moduleDef.router({ prefix: '/users' });
    router.get('/', { handler: () => [] });
    router.get('/:id', { handler: () => ({}) });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

    const routes = collectRoutes('/', [{ module: mod }]);

    expect(routes).toEqual([
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/users/:id' },
    ]);
  });

  it('handles basePath "/" with root prefix and root path', () => {
    const moduleDef = createModuleDef({ name: 'root' });
    const router = moduleDef.router({ prefix: '/' });
    router.get('/', { handler: () => [] });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

    const routes = collectRoutes('/', [{ module: mod }]);

    expect(routes).toEqual([{ method: 'GET', path: '/' }]);
  });

  it('collects routes across multiple modules', () => {
    const userDef = createModuleDef({ name: 'users' });
    const userRouter = userDef.router({ prefix: '/users' });
    userRouter.get('/', { handler: () => [] });
    const userMod = createModule(userDef, { services: [], routers: [userRouter], exports: [] });

    const taskDef = createModuleDef({ name: 'tasks' });
    const taskRouter = taskDef.router({ prefix: '/tasks' });
    taskRouter.get('/', { handler: () => [] });
    const taskMod = createModule(taskDef, { services: [], routers: [taskRouter], exports: [] });

    const routes = collectRoutes('', [{ module: userMod }, { module: taskMod }]);

    expect(routes).toEqual([
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/tasks' },
    ]);
  });
});

describe('formatRouteLog', () => {
  it('returns an empty string when there are no routes', () => {
    const result = formatRouteLog('http://localhost:3000', []);

    expect(result).toBe('vertz server listening on http://localhost:3000');
  });

  it('formats routes with aligned methods and paths', () => {
    const routes: RouteInfo[] = [
      { method: 'GET', path: '/users' },
      { method: 'POST', path: '/users' },
    ];

    const result = formatRouteLog('http://localhost:3000', routes);

    expect(result).toContain('vertz server listening on http://localhost:3000');
    expect(result).toContain('GET    /users');
    expect(result).toContain('POST   /users');
  });

  it('pads methods to uniform width based on longest method', () => {
    const routes: RouteInfo[] = [
      { method: 'GET', path: '/a' },
      { method: 'DELETE', path: '/b' },
    ];

    const result = formatRouteLog('http://localhost:3000', routes);

    // DELETE is 6 chars, so GET should be padded to 6
    expect(result).toContain('GET    /a');
    expect(result).toContain('DELETE /b');
  });

  it('sorts routes by path first, then by method', () => {
    const routes: RouteInfo[] = [
      { method: 'POST', path: '/users' },
      { method: 'GET', path: '/tasks' },
      { method: 'GET', path: '/users' },
    ];

    const result = formatRouteLog('http://localhost:3000', routes);
    const lines = result.split('\n');
    const routeLines = lines.filter((l) => l.trim().match(/^[A-Z]+\s+\//));

    expect(routeLines[0]).toContain('GET');
    expect(routeLines[0]).toContain('/tasks');
    expect(routeLines[1]).toContain('GET');
    expect(routeLines[1]).toContain('/users');
    expect(routeLines[2]).toContain('POST');
    expect(routeLines[2]).toContain('/users');
  });

  it('indents route lines with two spaces', () => {
    const routes: RouteInfo[] = [{ method: 'GET', path: '/users' }];

    const result = formatRouteLog('http://localhost:3000', routes);
    const lines = result.split('\n');
    const routeLine = lines.find((l) => l.includes('/users'));

    expect(routeLine).toMatch(/^ {2}GET/);
  });

  it('includes a blank line between the URL and the routes', () => {
    const routes: RouteInfo[] = [{ method: 'GET', path: '/users' }];

    const result = formatRouteLog('http://localhost:3000', routes);
    const lines = result.split('\n');

    expect(lines[0]).toBe('vertz server listening on http://localhost:3000');
    expect(lines[1]).toBe('');
    expect(lines[2]).toContain('GET');
  });
});
