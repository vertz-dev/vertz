import { afterEach, describe, expect, it } from 'vitest';
import { nodeAdapter } from './node';
import type { ServerHandle } from './types';

describe('Node runtime adapter', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
  });

  it('has name "node"', () => {
    expect(nodeAdapter.name).toBe('node');
  });

  it('creates a server on a random port', async () => {
    const handler = async () => new Response('ok');
    handle = await nodeAdapter.createServer(handler);

    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://localhost:${handle.port}`);
  });

  it('responds to HTTP requests through the handler', async () => {
    const handler = async () => new Response('hello from node');
    handle = await nodeAdapter.createServer(handler);

    const res = await fetch(handle.url);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe('hello from node');
  });

  it('stops accepting requests after close', async () => {
    const handler = async () => new Response('ok');
    handle = await nodeAdapter.createServer(handler);
    const url = handle.url;

    await handle.close();
    handle = undefined;

    await expect(fetch(url)).rejects.toThrow();
  });
});
