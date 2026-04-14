import { afterEach, describe, expect, it } from '@vertz/test';
import { createHandler as directCreateHandler } from '@vertz/cloudflare';
import { cloudflareAdapter } from './cloudflare';
import { resolveRuntimeAdapter } from './index';
import type { ServerHandle } from './types';

describe('vertz/cloudflare meta-package smoke', () => {
  it('vertz/cloudflare re-exports match @vertz/cloudflare', async () => {
    const metaPkg = await import('vertz/cloudflare');
    expect(metaPkg.createHandler).toBe(directCreateHandler);
  });

  it('vertz/cloudflare exports createHandler as a function', async () => {
    const metaPkg = await import('vertz/cloudflare');
    expect(typeof metaPkg.createHandler).toBe('function');
  });

  it('vertz/cloudflare exports generateNonce as a function', async () => {
    const metaPkg = await import('vertz/cloudflare');
    expect(typeof metaPkg.generateNonce).toBe('function');
  });

  it('vertz/cloudflare exports generateHTMLTemplate as a function', async () => {
    const metaPkg = await import('vertz/cloudflare');
    expect(typeof metaPkg.generateHTMLTemplate).toBe('function');
  });
});

describe('invalid RUNTIME rejection', () => {
  it('fails with an explicit error listing supported runtimes including cloudflare', () => {
    const fn = () => resolveRuntimeAdapter('invalid-runtime');
    expect(fn).toThrow('Unknown RUNTIME: invalid-runtime');
    expect(fn).toThrow('cloudflare');
    expect(fn).toThrow('node');
    expect(fn).toThrow('bun');
    expect(fn).toThrow('deno');
  });
});

describe('Cloudflare runtime adapter', () => {
  let handle: ServerHandle | undefined;

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
  });

  it('has name "cloudflare"', () => {
    expect(cloudflareAdapter.name).toBe('cloudflare');
  });

  it('creates a server on a random port', async () => {
    const handler = async () => new Response('ok');
    handle = await cloudflareAdapter.createServer(handler);

    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://localhost:${handle.port}`);
  });

  it('responds to HTTP requests through the Cloudflare handler path', async () => {
    const handler = async () => new Response('hello from cloudflare');
    handle = await cloudflareAdapter.createServer(handler);

    const res = await fetch(handle.url);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(body).toBe('hello from cloudflare');
  });

  it('stops accepting requests after close', async () => {
    const handler = async () => new Response('ok');
    handle = await cloudflareAdapter.createServer(handler);
    const url = handle.url;

    await handle.close();
    handle = undefined;

    await expect(fetch(url)).rejects.toThrow();
  });
});
