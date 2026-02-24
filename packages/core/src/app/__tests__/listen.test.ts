import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import type { ServerHandle } from '../../types/server-adapter';
import { createApp } from '../app-builder';

const hasBun = 'Bun' in globalThis;

describe.skipIf(!hasBun)('app.listen', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it('exposes a listen method on the app builder', () => {
    const app = createApp({});
    expect(app.listen).toBeTypeOf('function');
  });

  it('starts a server that responds to requests using the app handler', async () => {
    const app = createApp({});
    handle = await app.listen(0);

    const res = await fetch(`http://localhost:${handle.port}/hello`);
    expect(res.status).toBe(404);
  });

  it('returns a ServerHandle with port, hostname, and close', async () => {
    const app = createApp({});
    handle = await app.listen(0);

    expect(handle.port).toBeTypeOf('number');
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.hostname).toBeTypeOf('string');
    expect(handle.close).toBeTypeOf('function');
  });

  it('serves registered routes through the running server', async () => {
    const moduleDef = createModuleDef({ name: 'test' });
    const router = moduleDef.router({ prefix: '/greet' });
    router.get('/', { handler: () => ({ message: 'hello' }) });
    const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

    const app = createApp({}).register(mod);
    handle = await app.listen(0);

    const res = await fetch(`http://localhost:${handle.port}/greet`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: 'hello' });
  });

  it('stops the server when close() is called', async () => {
    const app = createApp({});
    handle = await app.listen(0);
    const { port } = handle;

    await handle.close();
    handle = undefined;

    const result = await fetch(`http://localhost:${port}/hello`).catch((e) => e);
    expect(result).toBeInstanceOf(Error);
  });

  it('uses the specified port when provided', async () => {
    const app = createApp({});
    handle = await app.listen(0);

    expect(handle.port).toBeTypeOf('number');
    expect(handle.port).toBeGreaterThan(0);
  });

  it('allows calling close() multiple times without error', async () => {
    const app = createApp({});
    handle = await app.listen(0);

    await handle.close();
    await handle.close();
    handle = undefined;
  });

  describe('startup route log', () => {
    let logSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      logSpy = spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(async () => {
      logSpy.mockRestore();
      await handle?.close();
      handle = undefined;
    });

    it('prints the listening URL and registered routes on startup', async () => {
      const moduleDef = createModuleDef({ name: 'users' });
      const router = moduleDef.router({ prefix: '/users' });
      router.get('/', { handler: () => [] });
      router.post('/', { handler: () => ({}) });
      router.get('/:id', { handler: () => ({}) });
      const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

      const app = createApp({}).register(mod);
      handle = await app.listen(0);

      const output = logSpy.mock.calls.map((args) => args[0]).join('\n');

      expect(output).toContain(`vertz server listening on http://localhost:${handle.port}`);
      expect(output).toContain('GET    /users');
      expect(output).toContain('POST   /users');
      expect(output).toContain('GET    /users/:id');
    });

    it('includes basePath in logged routes', async () => {
      const moduleDef = createModuleDef({ name: 'tasks' });
      const router = moduleDef.router({ prefix: '/tasks' });
      router.get('/', { handler: () => [] });
      const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

      const app = createApp({ basePath: '/api' }).register(mod);
      handle = await app.listen(0);

      const output = logSpy.mock.calls.map((args) => args[0]).join('\n');

      expect(output).toContain('GET    /api/tasks');
    });

    it('sorts routes by path then method', async () => {
      const taskDef = createModuleDef({ name: 'tasks' });
      const taskRouter = taskDef.router({ prefix: '/tasks' });
      taskRouter.post('/', { handler: () => ({}) });
      taskRouter.get('/', { handler: () => [] });
      const taskMod = createModule(taskDef, { services: [], routers: [taskRouter], exports: [] });

      const userDef = createModuleDef({ name: 'users' });
      const userRouter = userDef.router({ prefix: '/users' });
      userRouter.get('/', { handler: () => [] });
      const userMod = createModule(userDef, { services: [], routers: [userRouter], exports: [] });

      const app = createApp({}).register(taskMod).register(userMod);
      handle = await app.listen(0);

      const output = logSpy.mock.calls.map((args) => args[0]).join('\n');
      const getTasksIdx = output.indexOf('GET    /tasks');
      const postTasksIdx = output.indexOf('POST   /tasks');
      const getUsersIdx = output.indexOf('GET    /users');

      expect(getTasksIdx).toBeLessThan(postTasksIdx);
      expect(postTasksIdx).toBeLessThan(getUsersIdx);
    });

    it('suppresses route log when logRoutes is false', async () => {
      const moduleDef = createModuleDef({ name: 'test' });
      const router = moduleDef.router({ prefix: '/test' });
      router.get('/', { handler: () => [] });
      const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

      const app = createApp({}).register(mod);
      handle = await app.listen(0, { logRoutes: false });

      const output = logSpy.mock.calls.map((args) => args[0]).join('\n');

      expect(output).not.toContain('vertz server listening');
      expect(output).not.toContain('GET');
    });

    it('prints routes by default (logRoutes not specified)', async () => {
      const moduleDef = createModuleDef({ name: 'test' });
      const router = moduleDef.router({ prefix: '/items' });
      router.get('/', { handler: () => [] });
      const mod = createModule(moduleDef, { services: [], routers: [router], exports: [] });

      const app = createApp({}).register(mod);
      handle = await app.listen(0);

      const output = logSpy.mock.calls.map((args) => args[0]).join('\n');

      expect(output).toContain('vertz server listening');
      expect(output).toContain('GET    /items');
    });

    it('prints only the listening URL when no routes are registered', async () => {
      const app = createApp({});
      handle = await app.listen(0);

      const output = logSpy.mock.calls.map((args) => args[0]).join('\n');

      expect(output).toContain(`vertz server listening on http://localhost:${handle.port}`);
    });
  });
});
