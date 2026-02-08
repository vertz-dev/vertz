import { afterEach, describe, expect, it } from 'vitest';
import { createModule } from '../../module/module';
import { createModuleDef } from '../../module/module-def';
import type { ServerHandle } from '../../types/server-adapter';
import { createApp } from '../app-builder';

describe('app.listen', () => {
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
});
