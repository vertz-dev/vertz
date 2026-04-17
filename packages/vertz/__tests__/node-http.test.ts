import { afterEach, describe, expect, it } from '@vertz/test';
import { createServer, type Server } from 'node:http';

/**
 * Regression coverage for #2718 / #2720.
 *
 * Before the fix, vtz's synthetic `node:http` module treated
 * `globalThis.__vtz_http.serve()` as a Promise — but it's synchronous and
 * returns a plain `{ id, port, hostname, close }` object. The resulting
 * `.then()` on a non-thenable threw a TypeError that was swallowed by the
 * `new Promise((resolve) => server.listen(0, resolve))` idiom, so the
 * listen callback never fired and tests hung at the 120s watchdog.
 */
describe('node:http under vtz', () => {
  const openServers: Server[] = [];

  afterEach(async () => {
    while (openServers.length) {
      const s = openServers.pop()!;
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });

  it('listen(0) invokes the callback with an OS-assigned port', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200);
      res.end('ok');
    });
    openServers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as { port: number };
    expect(addr.port).toBeGreaterThan(0);
  });

  it('serves a buffered request and writes the response', async () => {
    const server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('hello from vtz');
    });
    openServers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };

    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello from vtz');
  });

  it('close() fires its callback even when no requests are in-flight', async () => {
    const server = createServer(() => {});
    await new Promise<void>((resolve) => server.listen(0, resolve));
    let closed = false;
    await new Promise<void>((resolve) =>
      server.close(() => {
        closed = true;
        resolve();
      }),
    );
    expect(closed).toBe(true);
  });

  it('close() defers its callback until in-flight requests settle', async () => {
    let handlerCompleted = false;
    let handlerResolve: (() => void) | null = null;
    const handlerGate = new Promise<void>((resolve) => {
      handlerResolve = resolve;
    });

    const server = createServer(async (_req, res) => {
      await handlerGate;
      res.writeHead(200);
      res.end('done');
      handlerCompleted = true;
    });
    openServers.push(server);

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as { port: number };

    const responsePromise = fetch(`http://localhost:${port}/`);
    // Give the request time to arrive so the handler is executing.
    await new Promise((r) => setTimeout(r, 20));

    let closeCallbackFired = false;
    const closePromise = new Promise<void>((resolve) =>
      server.close(() => {
        closeCallbackFired = true;
        resolve();
      }),
    );

    // close cb must not fire while the handler is still pending.
    await new Promise((r) => setTimeout(r, 20));
    expect(closeCallbackFired).toBe(false);

    // Release the handler — the response should complete, then close fires.
    handlerResolve!();
    const res = await responsePromise;
    expect(res.status).toBe(200);
    await closePromise;
    expect(handlerCompleted).toBe(true);
    expect(closeCallbackFired).toBe(true);
  });

  it('reports an error to the listen callback when bind fails', async () => {
    // Privileged ports < 1024 cannot be bound as a non-root user, so we use
    // this to force a deterministic bind failure across platforms.
    const server = createServer(() => {});
    const err = await new Promise<Error | null>((resolve) => {
      server.listen(1, '127.0.0.1', (e?: Error) => resolve(e ?? null));
    });
    // Some CI sandboxes may allow the bind; in that case clean up and skip.
    if (err === null) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      return;
    }
    expect(err).toBeInstanceOf(Error);
  });
});
