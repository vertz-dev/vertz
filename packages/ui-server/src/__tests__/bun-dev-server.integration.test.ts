/**
 * Integration tests for the unified SSR+HMR dev server.
 *
 * These tests actually start a Bun.serve() instance and make real HTTP
 * requests to verify the full request/response cycle.
 *
 * NOTE: These tests need the real Bun runtime with `Bun.serve()`,
 * `Bun.file()`, and `plugin()`. They require a built dist to resolve
 * the HMR shell's module imports.
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

    // Should have either the discovered HMR placeholder (type="text/plain" + loader)
    // or fallback module script (type="module") when HMR discovery fails
    expect(html).toContain('<script');
    expect(html.includes('type="text/plain"') || html.includes('type="module"')).toBe(true);
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

  // ── Path traversal protection ────────────────────────────────────

  describe('path traversal protection', () => {
    it('does not serve files outside project root via ../ traversal', async () => {
      writeSSRFixture();
      // Place a sensitive file OUTSIDE the project root (in its parent directory)
      const parentDir = join(tmpDir, '..');
      const secretPath = join(parentDir, `vertz-secret-${Date.now()}.txt`);
      writeFileSync(secretPath, 'top-secret-data');
      const port = randomPort();

      try {
        devServer = createBunDevServer({
          entry: './src/app.js',
          port,
          host: 'localhost',
          projectRoot: tmpDir,
          logRequests: false,
          ssrModule: true,
        });

        await devServer.start();

        // Attempt path traversal to escape project root.
        // The normalize() + startsWith() guard in bun-dev-server.ts should
        // prevent resolving to a path outside projectRoot.
        const filename = secretPath.split('/').pop();
        const res = await fetch(`http://localhost:${port}/../${filename}`, {
          headers: { Accept: 'text/plain' },
        });
        const body = await res.text();

        // Should NOT contain the secret content
        expect(body).not.toContain('top-secret-data');
      } finally {
        rmSync(secretPath, { force: true });
      }
    });

    it('does not serve /etc/passwd via encoded path traversal', async () => {
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

      // Attempt to read /etc/passwd via deep path traversal
      const res = await fetch(`http://localhost:${port}/..%2F..%2F..%2F..%2F..%2Fetc%2Fpasswd`, {
        headers: { Accept: 'text/plain' },
      });
      const body = await res.text();

      // Should NOT contain passwd-style content
      expect(body).not.toContain('root:');
    });

    it('still serves legitimate files from public/', async () => {
      writeSSRFixture();
      writeFileSync(join(tmpDir, 'public', 'style.css'), 'body { margin: 0 }');
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
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(body).toContain('body { margin: 0 }');
    });
  });

  // ── WebSocket Error Channel ────────────────────────────────────

  describe('WebSocket error channel', () => {
    it('upgrades /__vertz_errors to WebSocket and sends connected message', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      const msg = await new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
        ws.onerror = () => reject(new Error('WebSocket error'));
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      const parsed = JSON.parse(msg);
      expect(parsed).toEqual({ type: 'connected' });

      ws.close();
    });

    it('supports multiple simultaneous WebSocket clients', async () => {
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

      const connect = () =>
        new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
          ws.onmessage = () => resolve(ws);
          ws.onerror = () => reject(new Error('WebSocket error'));
          setTimeout(() => reject(new Error('Timeout')), 5000);
        });

      const [ws1, ws2, ws3] = await Promise.all([connect(), connect(), connect()]);

      // All three connected successfully
      expect(ws1.readyState).toBe(WebSocket.OPEN);
      expect(ws2.readyState).toBe(WebSocket.OPEN);
      expect(ws3.readyState).toBe(WebSocket.OPEN);

      ws1.close();
      ws2.close();
      ws3.close();
    });

    it('broadcasts error to all connected clients', async () => {
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

      // Connect two clients
      const connectAndWait = () =>
        new Promise<WebSocket>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
          ws.onmessage = () => resolve(ws); // connected msg
          ws.onerror = () => reject(new Error('WebSocket error'));
          setTimeout(() => reject(new Error('Timeout')), 5000);
        });

      const [ws1, ws2] = await Promise.all([connectAndWait(), connectAndWait()]);

      // Listen for next messages
      const msg1 = new Promise<string>((resolve) => {
        ws1.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
      });
      const msg2 = new Promise<string>((resolve) => {
        ws2.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
      });

      // Trigger error via broadcastError
      devServer.broadcastError('build', [{ message: 'Syntax error' }]);

      const [data1, data2] = await Promise.all([msg1, msg2]);
      const parsed1 = JSON.parse(data1);
      const parsed2 = JSON.parse(data2);

      expect(parsed1).toEqual({
        type: 'error',
        category: 'build',
        errors: [{ message: 'Syntax error' }],
      });
      expect(parsed2).toEqual(parsed1);

      ws1.close();
      ws2.close();
    });

    it('clearError sends clear message to all clients', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      // Broadcast an error first
      devServer.broadcastError('build', [{ message: 'err' }]);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // error msg
      });

      // Listen for clear
      const clearMsg = new Promise<string>((resolve) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
      });

      devServer.clearError();
      const parsed = JSON.parse(await clearMsg);
      expect(parsed).toEqual({ type: 'clear' });

      ws.close();
    });

    it('new client receives current error on connect', async () => {
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

      // Set error before any client connects
      devServer.broadcastError('resolve', [{ message: 'Cannot find module' }]);

      // Connect — should receive connected + error
      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      const messages: string[] = [];
      await new Promise<void>((resolve, reject) => {
        ws.onmessage = (e) => {
          messages.push(typeof e.data === 'string' ? e.data : '');
          if (messages.length >= 2) resolve();
        };
        ws.onerror = () => reject(new Error('WebSocket error'));
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      expect(JSON.parse(messages[0]!)).toEqual({ type: 'connected' });
      expect(JSON.parse(messages[1]!)).toEqual({
        type: 'error',
        category: 'resolve',
        errors: [{ message: 'Cannot find module' }],
      });

      ws.close();
    });

    it('/__vertz_build_check returns currentError from error channel', async () => {
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

      // Set an error via the error channel
      devServer.broadcastError('build', [{ message: 'Parse error', file: 'app.tsx', line: 10 }]);

      const res = await fetch(`http://localhost:${port}/__vertz_build_check`);
      const json = await res.json();

      expect(json.errors).toEqual([{ message: 'Parse error', file: 'app.tsx', line: 10 }]);
    });

    it('file change with syntax error broadcasts build error via WS', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      // Listen for error message
      const errorMsg = new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
        setTimeout(() => reject(new Error('Timeout waiting for build error')), 10000);
      });

      // Write a syntax error to trigger the watcher
      writeFileSync(
        join(tmpDir, 'src', 'app.js'),
        'export default function App() { const x = ; return x; }',
      );

      const parsed = JSON.parse(await errorMsg);
      expect(parsed.type).toBe('error');
      expect(parsed.category).toBe('build');
      expect(parsed.errors.length).toBeGreaterThan(0);

      ws.close();
    });

    it('file change with valid code clears existing error via WS', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      // Set an existing error
      devServer.broadcastError('build', [{ message: 'old error' }]);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // error msg
      });

      // Listen for clear message
      const clearMsg = new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
        setTimeout(() => reject(new Error('Timeout waiting for clear')), 10000);
      });

      // Write valid code to trigger the watcher
      writeSSRFixture('Fixed!');

      const parsed = JSON.parse(await clearMsg);
      expect(parsed).toEqual({ type: 'clear' });

      ws.close();
    });

    it('SSR render failure broadcasts error with category ssr', async () => {
      // Write a module that throws during render
      const fixturePath = join(tmpDir, 'src', 'app.js');
      writeFileSync(fixturePath, `export default function App() { throw new Error('SSR crash'); }`);
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      // Listen for error message
      const errorMsg = new Promise<string>((resolve) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
      });

      // Trigger SSR render by fetching a page
      await fetch(`http://localhost:${port}/`);

      const parsed = JSON.parse(await errorMsg);
      expect(parsed.type).toBe('error');
      expect(parsed.category).toBe('ssr');
      expect(parsed.errors[0].message).toContain('SSR crash');

      ws.close();
    });

    it('successful SSR after failure clears the error', async () => {
      // Start with a crashing module
      const fixturePath = join(tmpDir, 'src', 'app.js');
      writeFileSync(fixturePath, `export default function App() { throw new Error('SSR crash'); }`);
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

      // Set error state
      devServer.broadcastError('ssr', [{ message: 'SSR crash' }]);

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      // Skip connected + error
      let msgCount = 0;
      await new Promise<void>((resolve) => {
        ws.onmessage = () => {
          msgCount++;
          if (msgCount >= 2) resolve();
        };
      });

      // Fix the module and trigger file watcher to reload SSR
      writeSSRFixture('Fixed SSR');

      // Wait for the clear message (from proactive build check clearing)
      const clearMsg = new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
        setTimeout(() => reject(new Error('Timeout')), 10000);
      });

      const parsed = JSON.parse(await clearMsg);
      expect(parsed).toEqual({ type: 'clear' });

      ws.close();
    });

    it('console.error with resolution pattern broadcasts resolve error', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      const errorMsg = new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });

      // Simulate Bun's bundler logging a resolution error
      console.error('Could not resolve: "./nonexistent"\n    at /tmp/test/src/app.tsx');

      const parsed = JSON.parse(await errorMsg);
      expect(parsed.type).toBe('error');
      expect(parsed.category).toBe('resolve');
      expect(parsed.errors[0].message).toContain('Could not resolve');

      ws.close();
    });

    it('console.error with [Server] prefix is not broadcast', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      // Set up a listener that should NOT fire
      let received = false;
      ws.onmessage = () => {
        received = true;
      };

      // This should NOT broadcast
      console.error('[Server] Some server log');

      // Wait briefly to confirm no message was sent
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(received).toBe(false);

      ws.close();
    });

    it('duplicate console.error text does not broadcast again', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      const messages: string[] = [];
      ws.onmessage = (e) => {
        messages.push(typeof e.data === 'string' ? e.data : '');
      };

      // Broadcast the same error twice
      console.error('Could not resolve: "./missing"');
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.error('Could not resolve: "./missing"');
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should only broadcast once (duplicate suppressed)
      expect(messages.length).toBe(1);

      ws.close();
    });

    it('build error is not overwritten by ssr error', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // connected
      });

      // Broadcast a build error
      devServer.broadcastError('build', [{ message: 'syntax error' }]);
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve(); // error msg
      });

      // Try broadcasting an SSR error — should be suppressed
      devServer.broadcastError('ssr', [{ message: 'ssr failure' }]);

      // Give time for potential message
      await new Promise((r) => setTimeout(r, 100));

      // Verify currentError is still the build error via /__vertz_build_check
      const res = await fetch(`http://localhost:${port}/__vertz_build_check`);
      const data = await res.json();
      expect(data.errors).toEqual([{ message: 'syntax error' }]);

      ws.close();
    });

    it('responds to ping with pong', async () => {
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

      const ws = new WebSocket(`ws://localhost:${port}/__vertz_errors`);

      // Wait for connected message first
      await new Promise<void>((resolve) => {
        ws.onmessage = () => resolve();
      });

      // Send ping and wait for pong
      const pong = new Promise<string>((resolve, reject) => {
        ws.onmessage = (e) => resolve(typeof e.data === 'string' ? e.data : '');
        setTimeout(() => reject(new Error('Timeout')), 5000);
      });
      ws.send(JSON.stringify({ type: 'ping' }));

      const parsed = JSON.parse(await pong);
      expect(parsed).toEqual({ type: 'pong' });

      ws.close();
    });
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
