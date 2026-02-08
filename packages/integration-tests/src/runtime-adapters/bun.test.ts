import { afterEach, describe, expect, it } from 'vitest';
import { bunAdapter } from './bun';
import type { ServerHandle } from './types';

describe('Bun runtime adapter', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
  });

  it('has name "bun"', () => {
    expect(bunAdapter.name).toBe('bun');
  });

  it('creates a server on a random port', async () => {
    const handler = async () => new Response('ok');
    handle = await bunAdapter.createServer(handler);

    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://localhost:${handle.port}`);
  });

  it('responds to HTTP requests through the handler', async () => {
    const handler = async () => new Response('hello from bun');
    handle = await bunAdapter.createServer(handler);

    const res = await fetch(handle.url);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe('hello from bun');
  });

  it('stops accepting requests after close', async () => {
    const handler = async () => new Response('ok');
    handle = await bunAdapter.createServer(handler);
    const url = handle.url;

    await handle.close();
    handle = undefined;

    await expect(fetch(url)).rejects.toThrow();
  });
});
