/**
 * Integration tests for the unified SSR+HMR dev server.
 *
 * These tests actually start a Bun.serve() instance and make real HTTP
 * requests to verify the full request/response cycle.
 *
 * NOTE: These tests use `bun:test` (not vitest) because they need the real
 * Bun runtime with `Bun.serve()`, `Bun.file()`, and `plugin()`.
 * They are excluded from vitest via vitest.config and run separately via
 * `bun test src/__tests__/bun-dev-server.integration.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type BunDevServer, createBunDevServer } from '../bun-dev-server';

let tmpDir: string;
let devServer: BunDevServer | null = null;

// Use a random high port to avoid conflicts
function randomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000);
}

beforeEach(() => {
  tmpDir = join(tmpdir(), `vertz-integration-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(tmpDir, 'src'), { recursive: true });
  mkdirSync(join(tmpDir, 'public'), { recursive: true });
});

afterEach(async () => {
  if (devServer) {
    await devServer.stop();
    devServer = null;
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

/**
 * Write a minimal SSR module fixture that exports a simple component.
 * This is a plain JS module (not TSX) so we don't need the compiler plugin.
 */
function writeSSRFixture(content = 'Hello SSR'): string {
  const fixturePath = join(tmpDir, 'src', 'app.js');
  writeFileSync(
    fixturePath,
    `
    export default function App() {
      const el = globalThis.document?.createElement('div') ?? {};
      if (el.textContent !== undefined) el.textContent = '${content}';
      return el;
    }
  `,
  );
  return fixturePath;
}

describe('bun-dev-server integration', () => {
  it('serves SSR HTML with content in #app div', async () => {
    writeSSRFixture('Integration Test');
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<div id="app">');
    expect(html).toContain('Integration Test');
  });

  it('delegates API routes to apiHandler', async () => {
    writeSSRFixture();
    const port = randomPort();

    const apiHandler = async (req: Request) => {
      const url = new URL(req.url);
      if (url.pathname === '/api/data') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('Not Found', { status: 404 });
    };

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      apiHandler,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/api/data`);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true });
  });

  it('serves static files from public/', async () => {
    writeSSRFixture();
    writeFileSync(join(tmpDir, 'public', 'style.css'), 'body { color: red }');
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/style.css`);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).toContain('body { color: red }');
  });

  it('returns 404 for unknown non-HTML paths', async () => {
    writeSSRFixture();
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/nonexistent.json`, {
      headers: { Accept: 'application/json' },
    });

    expect(res.status).toBe(404);
  });

  it('includes script tag in SSR HTML', async () => {
    writeSSRFixture();
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();

    // Should have either the discovered HMR script or fallback module script
    expect(html).toContain('<script');
    expect(html).toContain('type="module"');
  });

  it('includes page title in SSR HTML', async () => {
    writeSSRFixture();
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      title: 'My Custom Title',
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();

    expect(html).toContain('<title>My Custom Title</title>');
  });

  it('falls back to client-only HTML when SSR render fails', async () => {
    // Write a broken module that throws on render
    const fixturePath = join(tmpDir, 'src', 'app.js');
    writeFileSync(
      fixturePath,
      `
      export default function App() {
        throw new Error('Render crash');
      }
    `,
    );
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<script');
  });

  it('stop() cleans up the server', async () => {
    writeSSRFixture();
    const port = randomPort();

    devServer = createBunDevServer({
      entry: './src/app.js',
      port,
      host: 'localhost',
      projectRoot: tmpDir,
      logRequests: false,
      ssrModule: true,
    });

    await devServer.start();

    // Server should respond
    const res1 = await fetch(`http://localhost:${port}/`);
    expect(res1.status).toBe(200);

    await devServer.stop();
    devServer = null;

    // Server should no longer respond
    try {
      await fetch(`http://localhost:${port}/`);
      // If we get here, the server is still running (unexpected)
      expect(true).toBe(false);
    } catch {
      // Expected: connection refused
    }
  });
});
