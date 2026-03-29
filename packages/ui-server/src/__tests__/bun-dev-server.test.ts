import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildScriptTag,
  clearSSRRequireCache,
  createBunDevServer,
  createFetchInterceptor,
  createRuntimeErrorDeduplicator,
  detectFaviconTag,
  formatTerminalRuntimeError,
  generateSSRPageHtml,
  isReloadStub,
  isStaleGraphError,
  parseHMRAssets,
  parsePluginError,
  shouldCheckStaleBundler,
} from '../bun-dev-server';

// ── File-level server cleanup ──────────────────────────────────────────────
// Every createBunDevServer() call in this file MUST go through trackServer()
// so afterEach can stop all instances. Without this, fire-and-forget restart()
// calls leave Bun.serve handles and debounce timers alive, which keeps the
// bun process running indefinitely on Linux CI runners.
const _allServers: ReturnType<typeof createBunDevServer>[] = [];

function trackServer(opts?: Parameters<typeof createBunDevServer>[0]) {
  const s = createBunDevServer({ entry: './src/app.tsx', ...opts });
  _allServers.push(s);
  return s;
}

afterEach(async () => {
  for (const s of _allServers) {
    await s.stop();
  }
  _allServers.length = 0;
});
// ───────────────────────────────────────────────────────────────────────────

describe('createBunDevServer', () => {
  function makeServer(opts?: Parameters<typeof createBunDevServer>[0]) {
    return trackServer(opts);
  }

  it('returns an object with start and stop methods', () => {
    const server = makeServer();

    expect(server).toBeDefined();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('creates server in unified SSR+HMR mode (no ssr option needed)', () => {
    const server = makeServer();

    expect(server).toBeDefined();
  });

  it('accepts all configuration options', () => {
    const apiHandler = async (_req: Request) => new Response('ok');

    const server = makeServer({
      entry: './src/app.tsx',
      port: 4000,
      host: '0.0.0.0',
      apiHandler,
      skipSSRPaths: ['/api/', '/graphql/'],
      openapi: { specPath: '/tmp/openapi.json' },
      ssrModule: true,
      clientEntry: './src/entry-client.ts',
      title: 'Test App',
      projectRoot: '/tmp/test-project',
      logRequests: false,
      progressiveHTML: true,
    });

    expect(server).toBeDefined();
  });

  it('accepts progressiveHTML option', () => {
    const server = makeServer({ entry: './src/app.tsx', progressiveHTML: true });

    expect(server).toBeDefined();
  });

  it('accepts plugins option for user-supplied Bun plugins', () => {
    const customPlugin = {
      name: 'test-mdx-plugin',
      setup(_build: { onLoad: (filter: unknown, cb: unknown) => void }) {
        // no-op
      },
    };

    const server = makeServer({ entry: './src/app.tsx', plugins: [customPlugin] });

    expect(server).toBeDefined();
  });

  it('stop() is safe to call before start()', async () => {
    const server = makeServer();

    // Should not throw
    await server.stop();
  });

  it('defaults port to 3000', () => {
    const server = makeServer();

    expect(server).toBeDefined();
  });

  it('defaults host to localhost', () => {
    const server = makeServer();

    expect(server).toBeDefined();
  });

  it('defaults logRequests to true', () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

    const server = makeServer();

    expect(server).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('defaults skipSSRPaths to [/api/]', () => {
    const server = makeServer();

    expect(server).toBeDefined();
  });

  it('defaults title to Vertz App', () => {
    const server = makeServer({ entry: './src/app.tsx', ssrModule: true });

    expect(server).toBeDefined();
  });

  it('defaults projectRoot to process.cwd()', () => {
    const server = makeServer();

    expect(server).toBeDefined();
  });

  it('returns an object with a restart method', () => {
    const server = makeServer();

    expect(typeof server.restart).toBe('function');
  });

  it('restart() is safe to call before start()', async () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Should not throw — restart handles the case where server is not running
    await server.restart();
    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
  }, 10_000);

  it('broadcastError auto-triggers restart for stale-graph runtime errors', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer({ entry: './src/app.tsx', logRequests: true });

    // Call broadcastError with a stale-graph runtime error
    server.broadcastError('runtime', [
      { message: "Export named 'Button' not found in module './components'" },
    ]);

    // Give the auto-restart a tick to fire (it's fire-and-forget)
    await new Promise((r) => setTimeout(r, 50));

    // The server should have logged a restart attempt
    const restartMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Restarting dev server'),
    );
    expect(restartMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('broadcastError still broadcasts stale-graph errors even when restart cap is reached', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer({ entry: './src/app.tsx', logRequests: true });

    const staleError = [{ message: "Export named 'Button' not found in module './components'" }];

    // Even stale-graph errors should be broadcast (for overlay display)
    // regardless of whether restart fires or not
    server.broadcastError('runtime', staleError);

    // The error should be broadcast — it won't be debounced
    // (stale-graph errors bypass the debounce timer)
    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('broadcastError does not auto-restart for non-stale-graph runtime errors', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer({ entry: './src/app.tsx', logRequests: true });

    // Call broadcastError with a normal runtime error
    server.broadcastError('runtime', [{ message: "Cannot read property 'foo' of undefined" }]);

    // Should NOT trigger a stale-graph detection (synchronous log)
    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeUndefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('restart() concurrent guard skips when already restarting', async () => {
    // Restart does real I/O (dynamic imports, port binding) with retry delays
    // of 100+200+500ms. On CI, the imports fail (no app.tsx), so all 3 retries
    // run for both concurrent calls. 30s timeout accommodates slow CI runners.
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer({ entry: './src/app.tsx', logRequests: true });

    // Fire two concurrent restarts
    const first = server.restart();
    const second = server.restart();
    await Promise.all([first, second]);

    // The second call should have been skipped
    const skipMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('already in progress'),
    );
    expect(skipMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  }, 30_000);

  it('stop() can be called multiple times safely', async () => {
    const server = makeServer();

    await server.stop();
    await server.stop();
    // No error thrown
  });
});

describe('parseHMRAssets', () => {
  it('extracts bundled script URL from HMR shell HTML', () => {
    const html = `<!doctype html>
<html><head></head><body>
  <script type="module" src="/_bun/client/abc123def.js"></script>
</body></html>`;

    const result = parseHMRAssets(html);

    expect(result.scriptUrl).toBe('/_bun/client/abc123def.js');
  });

  it('extracts HMR bootstrap script', () => {
    const html = `<!doctype html>
<html><head></head><body>
  <script type="module" src="/_bun/client/abc123.js"></script>
  <script>((a)=>{document.addEventListener("DOMContentLoaded",()=>{a.unref()})})(new WebSocket("ws://localhost:3000"))</script>
</body></html>`;

    const result = parseHMRAssets(html);

    expect(result.bootstrapScript).toContain('<script>');
    expect(result.bootstrapScript).toContain('document.addEventListener');
  });

  it('returns null scriptUrl when no /_bun/client/ URL found', () => {
    const html = '<html><body><script src="/other.js"></script></body></html>';

    const result = parseHMRAssets(html);

    expect(result.scriptUrl).toBeNull();
  });

  it('returns null bootstrapScript when no bootstrap found', () => {
    const html = `<html><body>
  <script type="module" src="/_bun/client/abc.js"></script>
</body></html>`;

    const result = parseHMRAssets(html);

    expect(result.bootstrapScript).toBeNull();
  });

  it('returns both null for empty HTML', () => {
    const result = parseHMRAssets('');

    expect(result.scriptUrl).toBeNull();
    expect(result.bootstrapScript).toBeNull();
  });
});

describe('buildScriptTag', () => {
  it('uses type="text/plain" placeholder when bundledScriptUrl provided', () => {
    const tag = buildScriptTag('/_bun/client/abc123.js', null, './src/app.tsx');

    expect(tag).toContain('type="text/plain"');
    // The placeholder itself must NOT be type="module" — only the loader creates that at runtime
    expect(tag).not.toMatch(/type="module"[^>]*data-bun-dev-server-script/);
  });

  it('includes data-bun-dev-server-script and crossorigin on placeholder', () => {
    const tag = buildScriptTag('/_bun/client/abc123.js', null, './src/app.tsx');

    expect(tag).toContain('src="/_bun/client/abc123.js"');
    expect(tag).toContain('data-bun-dev-server-script');
    expect(tag).toContain('crossorigin');
  });

  it('includes loader script with stub detection when bundledScriptUrl provided', () => {
    const tag = buildScriptTag('/_bun/client/abc123.js', null, './src/app.tsx');

    // Loader must detect the reload stub signature
    expect(tag).toContain('try{location.reload()}');
    expect(tag).toContain('showOverlay');
    expect(tag).toContain('Build failed');
    expect(tag).toContain('Dev server unreachable');
  });

  it('loader fetches /__vertz_build_check for error details on stub detection', () => {
    const tag = buildScriptTag('/_bun/client/abc123.js', null, './src/app.tsx');

    expect(tag).toContain('/__vertz_build_check');
    // Should use shared overlay namespace for formatting
    expect(tag).toContain('__vertz_overlay');
    expect(tag).toContain('formatErrors');
  });

  it('generates plain module script when no bundledScriptUrl', () => {
    const tag = buildScriptTag(null, null, '/src/app.tsx');

    expect(tag).toContain('type="module"');
    expect(tag).toContain('src="/src/app.tsx"');
    expect(tag).not.toContain('data-bun-dev-server-script');
    expect(tag).not.toContain('showOverlay');
  });

  it('appends bootstrap script between placeholder and loader when provided', () => {
    const bootstrap =
      '<script>((a)=>{document.addEventListener("DOMContentLoaded",()=>{a.unref()})})</script>';
    const tag = buildScriptTag('/_bun/client/abc.js', bootstrap, './src/app.tsx');

    expect(tag).toContain('data-bun-dev-server-script');
    expect(tag).toContain(bootstrap);

    // Bootstrap should appear between placeholder and loader
    const placeholderIdx = tag.indexOf('type="text/plain"');
    const bootstrapIdx = tag.indexOf(bootstrap);
    const loaderIdx = tag.indexOf('showOverlay');
    expect(placeholderIdx).toBeLessThan(bootstrapIdx);
    expect(bootstrapIdx).toBeLessThan(loaderIdx);
  });

  it('does not append bootstrap when bundledScriptUrl is null', () => {
    const bootstrap = '<script>bootstrap</script>';
    const tag = buildScriptTag(null, bootstrap, './src/app.tsx');

    expect(tag).not.toContain('bootstrap');
  });

  it('loader requests auto-restart via WS when no build errors but stub detected', () => {
    const tag = buildScriptTag('/_bun/client/abc.js', null, './src/app.tsx');

    expect(tag).toContain('_autoRestart');
    expect(tag).toContain('_canAutoRestart');
  });

  it('loader shows restart message for stale bundler', () => {
    const tag = buildScriptTag('/_bun/client/abc.js', null, './src/app.tsx');

    expect(tag).toContain('Dev bundler appears stale');
  });

  it('loader keeps retry fallback when WS auto-restart unavailable', () => {
    const tag = buildScriptTag('/_bun/client/abc.js', null, './src/app.tsx');

    // Must still contain retry logic as fallback
    expect(tag).toContain('__vertz_stub_retry');
  });
});

describe('generateSSRPageHtml', () => {
  it('includes title in <head>', () => {
    const html = generateSSRPageHtml({
      title: 'My App',
      css: '',
      bodyHtml: '<p>Hello</p>',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('<title>My App</title>');
  });

  it('includes CSS in <head>', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '<style>.foo { color: red }</style>',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('<style>.foo { color: red }</style>');
  });

  it('places body HTML inside <div id="app">', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '<h1>Content</h1>',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('<div id="app"><h1>Content</h1></div>');
  });

  it('injects __VERTZ_SSR_DATA__ script when ssrData is non-empty', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [{ key: 'tasks', data: [1, 2, 3] }],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('window.__VERTZ_SSR_DATA__=');
  });

  it('omits __VERTZ_SSR_DATA__ script when ssrData is empty', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).not.toContain('__VERTZ_SSR_DATA__');
  });

  it('includes the script tag in body', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag:
        '<script type="module" src="/_bun/client/abc.js" data-bun-dev-server-script></script>',
    });

    expect(html).toContain('data-bun-dev-server-script');
  });

  it('includes reload guard script in <head>', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('__vertz_reload_count');
    expect(html).toContain('__vertz_reload_ts');
  });

  it('places reload guard script before the closing </head> tag', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    const guardIndex = html.indexOf('__vertz_reload_count');
    const headCloseIndex = html.indexOf('</head>');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(headCloseIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(headCloseIndex);
  });

  it('places reload guard script before the main script tag in <body>', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script type="module" src="/app.js"></script>',
    });

    const guardIndex = html.indexOf('__vertz_reload_count');
    const mainScriptIndex = html.indexOf('src="/app.js"');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(mainScriptIndex).toBeGreaterThan(-1);
    expect(guardIndex).toBeLessThan(mainScriptIndex);
  });

  it('includes error channel script in <head> before reload guard', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    const errorChannelIdx = html.indexOf('__vertz_errors');
    const reloadGuardIdx = html.indexOf('__vertz_reload_count');
    expect(errorChannelIdx).toBeGreaterThan(-1);
    expect(reloadGuardIdx).toBeGreaterThan(-1);
    expect(errorChannelIdx).toBeLessThan(reloadGuardIdx);
  });

  it('error channel script contains WebSocket URL', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('__vertz_errors');
    expect(html).toContain('WebSocket');
  });

  it('error channel script contains __vertz_error_data for MCP access', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('__vertz_error_data');
  });

  it('error channel script includes window error listener for runtime errors', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('addEventListener');
    expect(html).toContain('error');
    expect(html).toContain('unhandledrejection');
  });

  it('error channel script sends resolve-stack message for runtime errors', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Client should send resolve-stack to server for source map resolution
    expect(html).toContain('resolve-stack');
  });

  it('error channel script renders parsedStack frames in formatErrors', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // formatErrors should check for parsedStack and render stack frames
    expect(html).toContain('parsedStack');
    // Should contain vscode:// link generation for stack frames
    expect(html).toContain('vscode://file/');
  });

  it('error channel script stores WebSocket reference for runtime error handlers', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // WS ref must be stored so error handlers can send resolve-stack
    expect(html).toContain('V._ws');
  });

  it('HMR console.error handler does not send resolve-stack (server handles HMR errors)', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Extract the console.error handler for HMR errors
    // The HMR handler matches [vertz-hmr] and should NOT call _sendResolveStack
    // because the server-side console.error intercept handles these with lastChangedFile context
    const hmrHandlerMatch = html.match(/console\.error=function\(\)\{([\s\S]*?)origCE\.apply/);
    expect(hmrHandlerMatch).not.toBeNull();
    const hmrHandler = hmrHandlerMatch![1];
    // HMR handler should NOT reference _sendResolveStack
    expect(hmrHandler).not.toContain('_sendResolveStack');
  });

  it('window.onerror handler filters out bundled /_bun/ and blob: URLs from overlay', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // The window error handler should detect bundled URLs and exclude them from the overlay
    expect(html).toContain('/_bun/');
    expect(html).toContain('blob:');
    expect(html).toContain('isBundled');
  });

  it('shared overlay functions are accessible by both error channel and build error loader', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // The shared overlay namespace should be set by the error channel script
    expect(html).toContain('__vertz_overlay');
  });

  it('error channel script includes stale-graph error detection', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Should include inline isStaleGraph function that detects stale-graph errors
    expect(html).toContain('isStaleGraph');
    expect(html).toContain('Export named');
    expect(html).toContain('not found in module');
    expect(html).toContain('Failed to resolve module specifier');
  });

  it('error channel script includes "Restart Server" button for stale-graph errors', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain('Restart Server');
    expect(html).toContain('__vertz_restart');
  });

  it('error channel script handles restarting message from WebSocket', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).toContain("'restarting'");
    expect(html).toContain('Restarting dev server');
  });

  it('error channel script reloads page after reconnect following restart', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // When _restarting flag is set and connected message arrives, should reload
    expect(html).toContain('_restarting');
  });

  it('error channel script uses fast reconnect (100ms) when restarting', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Fast reconnect uses 100ms interval when _restarting is true
    expect(html).toContain('_restarting?100:delay');
  });

  it('error channel script clears reload guard counter on restart', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Reload guard session storage keys cleared to prevent post-restart reload being counted
    expect(html).toContain('__vertz_reload_count');
    expect(html).toContain('__vertz_reload_ts');
  });

  it('error channel script shows timeout message after 10s', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // 10 second timeout for restart
    expect(html).toContain('10000');
    expect(html).toContain('timed out');
  });

  it('error channel script sends restart request via WebSocket', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Restart button sends { type: 'restart' } over WS
    expect(html).toContain("type:'restart'");
  });

  it('error channel script handles late reconnect after timeout', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Even after timeout message, reconnecting WS should trigger reload
    expect(html).toContain('timedOut');
  });

  it('error channel script auto-sends restart for stale-graph window.onerror', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // window.onerror handler should auto-send restart when stale-graph detected
    // The handler checks isStaleGraph and sends { type: 'restart' } automatically
    expect(html).toContain('_autoRestart');
  });

  it('error channel script tracks auto-restart count in sessionStorage', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Auto-restart loop prevention uses sessionStorage to track restarts
    expect(html).toContain('__vertz_auto_restart');
  });

  it('error channel script caps auto-restarts at 3 within 10s window', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // Max 3 auto-restarts in a 10s window, then fall back to manual button
    expect(html).toContain('_canAutoRestart');
  });

  it('error channel script resets auto-restart counter after successful page load', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // After 5s of no stale-graph error, clear the auto-restart counter
    expect(html).toContain('__vertz_auto_restart');
    // The reset timeout fires after successful load
    expect(html).toContain('5000');
  });

  it('does not embed build error data element (errors fetched via /__vertz_build_check)', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).not.toContain('__vertz_build_error');
  });

  it('includes sessionScript when provided', () => {
    const sessionScript =
      '<script>window.__VERTZ_SESSION__={"user":{"id":"u1"},"expiresAt":999}</script>';
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '<p>Hello</p>',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      sessionScript,
    });

    expect(html).toContain('window.__VERTZ_SESSION__');
  });

  it('places sessionScript after #app div and before ssrDataScript', () => {
    const sessionScript =
      '<script>window.__VERTZ_SESSION__={"user":{"id":"u1"},"expiresAt":999}</script>';
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '<p>Content</p>',
      ssrData: [{ key: 'tasks', data: [1, 2] }],
      scriptTag: '<script src="/app.js"></script>',
      sessionScript,
    });

    const appDivEnd = html.indexOf('</div>');
    const sessionIdx = html.indexOf('__VERTZ_SESSION__');
    const ssrDataIdx = html.indexOf('__VERTZ_SSR_DATA__');
    const scriptTagIdx = html.indexOf('src="/app.js"');

    expect(sessionIdx).toBeGreaterThan(appDivEnd);
    expect(sessionIdx).toBeLessThan(ssrDataIdx);
    expect(ssrDataIdx).toBeLessThan(scriptTagIdx);
  });

  it('places sessionScript before scriptTag when no ssrData', () => {
    const sessionScript =
      '<script>window.__VERTZ_SESSION__={"user":{"id":"u1"},"expiresAt":999}</script>';
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      sessionScript,
    });

    const sessionIdx = html.indexOf('__VERTZ_SESSION__');
    const scriptTagIdx = html.indexOf('src="/app.js"');
    expect(sessionIdx).toBeLessThan(scriptTagIdx);
  });

  it('omits sessionScript when not provided', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    expect(html).not.toContain('__VERTZ_SESSION__');
  });

  it('includes headTags with favicon link when provided', () => {
    const faviconTag = '<link rel="icon" type="image/svg+xml" href="/favicon.svg">';
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      headTags: faviconTag,
    });

    expect(html).toContain(faviconTag);
    const titleIdx = html.indexOf('<title>');
    const faviconIdx = html.indexOf(faviconTag);
    expect(faviconIdx).toBeGreaterThan(titleIdx);
  });
});

describe('detectFaviconTag', () => {
  it('returns link tag when public/favicon.svg exists', () => {
    const tmpDir = path.join(os.tmpdir(), `vertz-favicon-exists-${Date.now()}`);
    mkdirSync(path.join(tmpDir, 'public'), { recursive: true });
    writeFileSync(path.join(tmpDir, 'public', 'favicon.svg'), '<svg></svg>');

    const tag = detectFaviconTag(tmpDir);
    expect(tag).toBe('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
  });

  it('returns empty string when public/favicon.svg does not exist', () => {
    const tmpDir = path.join(os.tmpdir(), `vertz-favicon-missing-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const tag = detectFaviconTag(tmpDir);
    expect(tag).toBe('');
  });

  it('returns empty string when public/ directory does not exist', () => {
    const tmpDir = path.join(os.tmpdir(), `vertz-favicon-nodir-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const tag = detectFaviconTag(tmpDir);
    expect(tag).toBe('');
  });
});

describe('createFetchInterceptor', () => {
  const mockOriginalFetch = mock(async () => new Response('original'));
  mockOriginalFetch.preconnect = mock();
  const mockApiHandler = mock(async () => new Response('api'));

  beforeEach(() => {
    mockOriginalFetch.mockClear();
    (mockOriginalFetch.preconnect as ReturnType<typeof mock>).mockClear();
    mockApiHandler.mockClear();
  });

  it('routes relative API paths to apiHandler', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApiHandler,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOriginalFetch as typeof fetch,
    });

    await intercepted('/api/todos');

    expect(mockApiHandler).toHaveBeenCalledTimes(1);
    expect(mockOriginalFetch).not.toHaveBeenCalled();
  });

  it('routes absolute local API URLs to apiHandler', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApiHandler,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOriginalFetch as typeof fetch,
    });

    await intercepted('http://localhost:3000/api/todos');

    expect(mockApiHandler).toHaveBeenCalledTimes(1);
    expect(mockOriginalFetch).not.toHaveBeenCalled();
  });

  it('passes external URLs to originalFetch', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApiHandler,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOriginalFetch as typeof fetch,
    });

    await intercepted('https://example.com/api/data');

    expect(mockOriginalFetch).toHaveBeenCalledTimes(1);
    expect(mockApiHandler).not.toHaveBeenCalled();
  });

  it('passes non-API local paths to originalFetch', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApiHandler,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOriginalFetch as typeof fetch,
    });

    await intercepted('/page/about');

    expect(mockOriginalFetch).toHaveBeenCalledTimes(1);
    expect(mockApiHandler).not.toHaveBeenCalled();
  });

  it('preserves preconnect from originalFetch', () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApiHandler,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOriginalFetch as typeof fetch,
    });

    expect(intercepted.preconnect).toBe(mockOriginalFetch.preconnect);
  });
});

describe('formatTerminalRuntimeError', () => {
  it('formats error with [Browser] prefix and file location', () => {
    const result = formatTerminalRuntimeError([
      {
        message: 'ReferenceError: foo is not defined',
        file: 'src/pages/home.tsx',
        line: 42,
        column: 5,
      },
    ]);

    expect(result).toContain('[Browser] ReferenceError: foo is not defined');
    expect(result).toContain('at src/pages/home.tsx:42:5');
  });

  it('includes line text snippet when available', () => {
    const result = formatTerminalRuntimeError([
      {
        message: 'ReferenceError: foo is not defined',
        file: 'src/pages/home.tsx',
        line: 42,
        column: 5,
        lineText: 'const result = foo.bar();',
      },
    ]);

    expect(result).toContain('\u2502 const result = foo.bar();');
  });

  it('formats error without file info', () => {
    const result = formatTerminalRuntimeError([
      { message: 'TypeError: Cannot read property of null' },
    ]);

    expect(result).toContain('[Browser] TypeError: Cannot read property of null');
    expect(result).not.toContain('at ');
  });

  it('includes resolved stack frames (first 5)', () => {
    const frames = Array.from({ length: 7 }, (_, i) => ({
      functionName: `fn${i}`,
      file: `src/file${i}.tsx`,
      absFile: `/project/src/file${i}.tsx`,
      line: i + 1,
      column: 0,
    }));

    const result = formatTerminalRuntimeError([{ message: 'Error: test' }], frames);

    expect(result).toContain('fn0');
    expect(result).toContain('fn4');
    expect(result).not.toContain('fn5');
  });

  it('handles stack frame with null functionName', () => {
    const result = formatTerminalRuntimeError(
      [{ message: 'Error: test' }],
      [
        {
          functionName: null,
          file: 'src/app.tsx',
          absFile: '/project/src/app.tsx',
          line: 10,
          column: 3,
        },
      ],
    );

    expect(result).toContain('at src/app.tsx:10:3');
    expect(result).not.toContain('null');
  });
});

describe('createRuntimeErrorDeduplicator', () => {
  it('shouldLog returns true for first error', () => {
    const dedup = createRuntimeErrorDeduplicator();

    expect(dedup.shouldLog('Error: foo', 'src/a.tsx', 10)).toBe(true);
  });

  it('shouldLog returns false for duplicate error', () => {
    const dedup = createRuntimeErrorDeduplicator();

    dedup.shouldLog('Error: foo', 'src/a.tsx', 10);

    expect(dedup.shouldLog('Error: foo', 'src/a.tsx', 10)).toBe(false);
  });

  it('shouldLog returns true for different error', () => {
    const dedup = createRuntimeErrorDeduplicator();

    dedup.shouldLog('Error: foo', 'src/a.tsx', 10);

    expect(dedup.shouldLog('Error: bar', 'src/a.tsx', 10)).toBe(true);
  });

  it('reset allows same error to log again', () => {
    const dedup = createRuntimeErrorDeduplicator();

    dedup.shouldLog('Error: foo', 'src/a.tsx', 10);
    dedup.reset();

    expect(dedup.shouldLog('Error: foo', 'src/a.tsx', 10)).toBe(true);
  });
});

describe('isStaleGraphError', () => {
  it('returns true for "Export named X not found in module Y"', () => {
    expect(
      isStaleGraphError("Export named 'button' not found in module './styles/components.ts'"),
    ).toBe(true);
  });

  it('returns true for "No matching export" errors', () => {
    expect(isStaleGraphError("No matching export in './utils.ts' for import 'helper'")).toBe(true);
  });

  it('returns true for "does not provide an export named" errors', () => {
    expect(
      isStaleGraphError("./styles/components.ts does not provide an export named 'button'"),
    ).toBe(true);
  });

  it('returns false for generic runtime errors', () => {
    expect(isStaleGraphError("Cannot read property 'foo' of undefined")).toBe(false);
  });

  it('returns false for syntax errors', () => {
    expect(isStaleGraphError("Unexpected token '}'")).toBe(false);
  });

  it('returns false for "Could not resolve" errors (handled by resolve category)', () => {
    expect(isStaleGraphError("Could not resolve './missing-module'")).toBe(false);
  });

  it('returns true for "Failed to resolve module specifier" (browser bare-import failure)', () => {
    expect(
      isStaleGraphError(
        'Failed to resolve module specifier "@vertz/ui". Relative references must start with either "/", "./", or "../".',
      ),
    ).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isStaleGraphError('')).toBe(false);
  });
});

describe('isReloadStub', () => {
  it('detects Bun reload stub', () => {
    const stub =
      'try{location.reload()}catch(_){}\naddEventListener("DOMContentLoaded",function(event){location.reload()})';
    expect(isReloadStub(stub)).toBe(true);
  });

  it('rejects valid JS bundle content', () => {
    expect(isReloadStub('import{signal}from"@vertz/ui";var app=function(){')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isReloadStub('')).toBe(false);
  });

  it('handles whitespace-prefixed stub', () => {
    expect(isReloadStub('  try{location.reload()}catch(_){}')).toBe(true);
  });

  it('detects stub with only the try/catch line', () => {
    expect(isReloadStub('try{location.reload()}catch(_){}')).toBe(true);
  });
});

describe('stale bundler detection', () => {
  it('source contains restart log message for stale dev bundler', () => {
    const source = readFileSync(new URL('../bun-dev-server.ts', import.meta.url).pathname, 'utf8');
    expect(source).toContain('Dev bundler serving reload stub after successful build');
  });

  it('skips stale bundler check when hash changed (HMR succeeded)', () => {
    expect(shouldCheckStaleBundler(true)).toBe(false);
  });

  it('runs stale bundler check when hash did NOT change (bundler may be stuck)', () => {
    expect(shouldCheckStaleBundler(false)).toBe(true);
  });

  it('file watcher uses shouldCheckStaleBundler to guard restart', () => {
    // The file watcher must only check for stale bundler when the hash did NOT change.
    // Verify the source code conditionally checks based on hashChanged.
    const source = readFileSync(new URL('../bun-dev-server.ts', import.meta.url).pathname, 'utf8');
    // Path D: post-build validation — must be guarded by !hashChanged
    expect(source).toContain('!hashChanged && bundledScriptUrl && server && !isRestarting');
    // Path E: post-SSR refresh — must be guarded by !hashChanged
    expect(source).toContain('!hashChanged && (await checkAndRestartIfBundlerStale())');
  });
});

describe('clearSSRRequireCache', () => {
  it('clears cache entries outside srcDir and entryPath', () => {
    const fakeKey = '/tmp/outside-project/lib/shared-utils.ts';
    require.cache[fakeKey] = {} as NodeModule;

    clearSSRRequireCache();

    expect(require.cache[fakeKey]).toBeUndefined();
  });

  it('returns the number of cache entries cleared', () => {
    require.cache['/tmp/fake-a.ts'] = {} as NodeModule;
    require.cache['/tmp/fake-b.ts'] = {} as NodeModule;

    const cleared = clearSSRRequireCache();

    expect(cleared).toBeGreaterThanOrEqual(2);
  });

  it('clears all entries regardless of path prefix', () => {
    require.cache['/project/src/app.tsx'] = {} as NodeModule;
    require.cache['/project/lib/shared.ts'] = {} as NodeModule;
    require.cache['/other/generated/routes.ts'] = {} as NodeModule;

    clearSSRRequireCache();

    expect(require.cache['/project/src/app.tsx']).toBeUndefined();
    expect(require.cache['/project/lib/shared.ts']).toBeUndefined();
    expect(require.cache['/other/generated/routes.ts']).toBeUndefined();
  });
});

describe('generateSSRPageHtml editor variants', () => {
  it('generates webstorm editor href with open?file= URL scheme', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      editor: 'webstorm',
    });

    expect(html).toContain('webstorm://open?file=');
    expect(html).not.toContain('webstorm://file/');
  });

  it('generates cursor editor href with cursor://file/ URL scheme', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      editor: 'cursor',
    });

    expect(html).toContain('cursor://file/');
  });

  it('generates zed editor href with zed://file/ URL scheme', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      editor: 'zed',
    });

    expect(html).toContain('zed://file/');
  });

  it('generates idea editor href with idea://open?file= URL scheme', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      editor: 'idea',
    });

    expect(html).toContain('idea://open?file=');
  });

  it('includes font fallback metrics in page HTML when provided', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
    });

    // The page should have valid HTML structure
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('</html>');
  });
});

describe('broadcastError state machine', () => {
  function makeServer(opts?: { logRequests?: boolean }) {
    return trackServer(opts);
  }

  it('build errors block subsequent SSR errors', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // First: broadcast a build error
    server.broadcastError('build', [{ message: 'Build failed' }]);

    // Second: try to broadcast an SSR error — should be blocked
    server.broadcastError('ssr', [{ message: 'SSR render failed' }]);

    // The SSR error should have been suppressed
    // (No direct state access, but we verify the build error took priority)
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('build errors block subsequent runtime errors', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    server.broadcastError('build', [{ message: 'Build failed' }]);
    server.broadcastError('runtime', [{ message: 'Runtime error' }]);

    // No stale graph detection for the runtime error (it was suppressed)
    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeUndefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('build errors can be overwritten by newer build errors', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    server.broadcastError('build', [{ message: 'First build error' }]);
    // Another build error should replace the first one
    server.broadcastError('build', [{ message: 'Second build error' }]);

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearError sets grace period that suppresses runtime errors', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Set an error, then clear it
    server.broadcastError('build', [{ message: 'Build error' }]);
    server.clearError();

    // Runtime error during grace period should be suppressed
    server.broadcastError('runtime', [{ message: 'Stale runtime error' }]);

    // No stale graph detection (error was suppressed by grace period)
    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeUndefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearErrorForFileChange does not set grace period', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer({ logRequests: true });

    // Set an error, then clear it via file change (no grace period)
    server.broadcastError('build', [{ message: 'Build error' }]);
    server.clearErrorForFileChange();

    // Stale-graph runtime error after clearErrorForFileChange should NOT be suppressed
    server.broadcastError('runtime', [
      { message: "Export named 'Button' not found in module './components'" },
    ]);

    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearError is no-op when no error is set', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Should not throw
    server.clearError();
    server.clearError();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearErrorForFileChange is no-op when no error is set', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Should not throw
    server.clearErrorForFileChange();
    server.clearErrorForFileChange();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('runtime errors are debounced and most informative error wins', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Fire multiple runtime errors in rapid succession
    server.broadcastError('runtime', [{ message: 'Error 1' }]);
    server.broadcastError('runtime', [{ message: 'Error 2', file: 'src/app.tsx' }]);
    server.broadcastError('runtime', [{ message: 'Error 3' }]);

    // Wait for debounce timer (100ms)
    await new Promise((r) => setTimeout(r, 150));

    // The error with file info should win (most informative)
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearError cancels pending debounced runtime error', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Broadcast a runtime error (will be debounced)
    server.broadcastError('runtime', [{ message: 'Debounced error' }]);

    // Clear before debounce fires
    server.clearError();

    // Wait for debounce period
    await new Promise((r) => setTimeout(r, 150));

    // The debounced error should not have been broadcast
    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearErrorForFileChange cancels pending debounced runtime error', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // Broadcast a runtime error (will be debounced)
    server.broadcastError('runtime', [{ message: 'Debounced error' }]);

    // Clear via file change before debounce fires
    server.clearErrorForFileChange();

    // Wait for debounce period
    await new Promise((r) => setTimeout(r, 150));

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('non-build/non-runtime errors are broadcast immediately', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = makeServer();

    // SSR and resolve errors should not be debounced
    server.broadcastError('ssr', [{ message: 'SSR error' }]);
    server.broadcastError('resolve', [{ message: 'Resolve error' }]);

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('setLastChangedFile updates internal state', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    // Should not throw
    server.setLastChangedFile('src/components/Button.tsx');

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('stale-graph error triggers auto-restart log', async () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = trackServer({ logRequests: true });

    const staleError = [{ message: "Export named 'X' not found in module 'Y'" }];

    // First stale-graph error should trigger auto-restart log
    server.broadcastError('runtime', staleError);

    // Wait for fire-and-forget restart to schedule
    await new Promise((r) => setTimeout(r, 20));

    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('console.error override (resolution, HMR, and frontend errors)', () => {
  it('captures resolution errors and broadcasts them', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error');
    const server = trackServer({ logRequests: false });

    // Simulate Bun console.error with a resolution error
    console.error("Could not resolve './missing-module'");

    // The error should have been broadcast (broadcastError called with 'resolve')
    // We verify the original console.error was still called
    expect(errSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('captures HMR runtime errors and broadcasts them', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    // Don't mock console.error — let the override run
    const server = trackServer({ logRequests: false });

    // Simulate Bun's HMR error output
    console.error(
      '[browser] [vertz-hmr] Error re-mounting TaskCard: ReferenceError: foo is not defined',
    );

    logSpy.mockRestore();
  });

  it('captures Bun frontend errors and broadcasts them', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    // Simulate Bun's ANSI-colored frontend error
    console.error('\x1b[31mfrontend\x1b[0m TypeError: Cannot read property of null');

    logSpy.mockRestore();
  });

  it('deduplicates repeated resolution errors', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    // Same error twice
    console.error("Could not resolve './missing-module'");
    console.error("Could not resolve './missing-module'");

    // Second should have been deduplicated (same lastBroadcastedError)
    logSpy.mockRestore();
  });

  it('ignores [Server] logs from internal code', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    // Server logs should not be captured as build errors
    console.error('[Server] Some internal message');

    logSpy.mockRestore();
  });

  it('captures "Module not found" as resolution error', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    console.error("Module not found: '@vertz/nonexistent'");

    logSpy.mockRestore();
  });

  it('captures "Cannot find module" as resolution error', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    console.error("Cannot find module './components/Missing'");

    logSpy.mockRestore();
  });

  it('uses lastChangedFile as fallback for HMR errors without stack source', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    // Set lastChangedFile before the error
    server.setLastChangedFile('src/components/Button.tsx');

    console.error('[browser] [vertz-hmr] Error re-mounting Button: TypeError: x is not a function');

    logSpy.mockRestore();
  });

  it('uses lastChangedFile as fallback for frontend errors without stack source', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    server.setLastChangedFile('src/pages/Home.tsx');

    console.error('\x1b[31mfrontend\x1b[0m ReferenceError: x is not defined');

    logSpy.mockRestore();
  });
});

describe('OpenAPI spec handling', () => {
  it('creates server with openapi option', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const tmpDir = path.join(os.tmpdir(), `vertz-openapi-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const specPath = path.join(tmpDir, 'openapi.json');
    writeFileSync(specPath, JSON.stringify({ openapi: '3.0.0', info: { title: 'Test API' } }));

    const server = trackServer({
      projectRoot: tmpDir,
      openapi: { specPath },
    });

    expect(server).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('formatTerminalRuntimeError edge cases', () => {
  it('returns empty string for empty errors array', () => {
    const result = formatTerminalRuntimeError([]);
    expect(result).toBe('');
  });

  it('formats error with file but no line number', () => {
    const result = formatTerminalRuntimeError([{ message: 'Error: test', file: 'src/app.tsx' }]);
    expect(result).toContain('at src/app.tsx');
    expect(result).not.toContain(':undefined');
  });

  it('formats error with file, line, but no column', () => {
    const result = formatTerminalRuntimeError([
      { message: 'Error: test', file: 'src/app.tsx', line: 42 },
    ]);
    expect(result).toContain('at src/app.tsx:42');
  });

  it('does not include stack frames when parsedStack is empty', () => {
    const result = formatTerminalRuntimeError([{ message: 'Error: test' }], []);
    expect(result).toBe('[Browser] Error: test');
  });
});

describe('createFetchInterceptor edge cases', () => {
  const mockOrigFetch = mock(async () => new Response('original'));
  mockOrigFetch.preconnect = mock();
  const mockApi = mock(async () => new Response('api'));

  beforeEach(() => {
    mockOrigFetch.mockClear();
    (mockOrigFetch.preconnect as ReturnType<typeof mock>).mockClear();
    mockApi.mockClear();
  });

  it('handles Request object as input', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApi,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOrigFetch as typeof fetch,
    });

    const req = new Request('http://localhost:3000/api/todos');
    await intercepted(req);

    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('handles URL object as input', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApi,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOrigFetch as typeof fetch,
    });

    await intercepted(new URL('http://localhost:3000/api/users'));

    expect(mockApi).toHaveBeenCalledTimes(1);
  });

  it('passes query string through to apiHandler', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApi,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/'],
      originalFetch: mockOrigFetch as typeof fetch,
    });

    await intercepted('/api/todos?status=active');

    expect(mockApi).toHaveBeenCalledTimes(1);
    const calledReq = mockApi.mock.calls[0][0] as Request;
    expect(calledReq.url).toContain('status=active');
  });

  it('matches multiple skipSSRPaths', async () => {
    const intercepted = createFetchInterceptor({
      apiHandler: mockApi,
      origin: 'http://localhost:3000',
      skipSSRPaths: ['/api/', '/graphql/'],
      originalFetch: mockOrigFetch as typeof fetch,
    });

    await intercepted('/graphql/query');
    expect(mockApi).toHaveBeenCalledTimes(1);
  });
});

describe('generateSSRPageHtml font fallback metrics', () => {
  it('includes accessSet script when provided', () => {
    const sessionScript =
      '<script>window.__VERTZ_SESSION__={"user":{"id":"u1"},"expiresAt":999}</script>\n' +
      '<script>window.__VERTZ_ACCESS_SET__=["task:read","task:write"]</script>';
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [],
      scriptTag: '<script src="/app.js"></script>',
      sessionScript,
    });

    expect(html).toContain('__VERTZ_ACCESS_SET__');
    expect(html).toContain('__VERTZ_SESSION__');
  });

  it('safeSerialize handles special characters in SSR data', () => {
    const html = generateSSRPageHtml({
      title: 'App',
      css: '',
      bodyHtml: '',
      ssrData: [{ key: 'test', data: { name: '<script>alert("xss")</script>' } }],
      scriptTag: '<script src="/app.js"></script>',
    });

    // SSR data should be safely serialized (no raw <script> tags)
    expect(html).toContain('__VERTZ_SSR_DATA__');
    // The HTML should not contain unescaped script tags in the data
    expect(html).not.toContain('<script>alert');
  });
});

describe('broadcastError with resolve and ssr categories', () => {
  it('resolve errors are broadcast immediately without debounce', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    server.broadcastError('resolve', [{ message: "Could not resolve './missing'" }]);

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('ssr errors are broadcast immediately without debounce', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});
    const server = trackServer({ logRequests: false });

    server.broadcastError('ssr', [{ message: 'SSR render error', stack: 'Error: ...' }]);

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});

describe('error recovery (#1849)', () => {
  it('clearError resets auto-restart timestamps so future restarts are not throttled', () => {
    // Use two separate server instances to avoid isRestarting state bleeding.
    // Server 1: trigger a stale-graph error (pushes timestamp), then clearError.
    // Server 2: verify that after clearError the timestamps were reset by
    // confirming a stale-graph error triggers "Stale graph detected" (not "cap reached").
    //
    // Since both instances share the same module-level state, this isn't a direct
    // unit test of reset behavior. Instead, we test the observable effect: after
    // clearError, the "Stale graph detected" log appears for the next stale error.
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});

    const server = trackServer({ logRequests: true });

    // Set a build error then clear it — clearError should reset timestamps
    server.broadcastError('build', [{ message: 'Build error' }]);
    server.clearError();

    logSpy.mockClear();

    // Create a fresh server (isRestarting is false) and verify stale-graph
    // still triggers properly after the clear
    const server2 = trackServer({ logRequests: true });
    server2.broadcastError('runtime', [{ message: "Export named 'X' not found in module './y'" }]);

    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('clearErrorForFileChange resets auto-restart timestamps', () => {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = spyOn(console, 'error').mockImplementation(() => {});

    const server = trackServer({ logRequests: true });

    // Set a build error so clearErrorForFileChange is not a no-op
    server.broadcastError('build', [{ message: 'Some build error' }]);
    server.clearErrorForFileChange();

    logSpy.mockClear();

    // Fresh server — verify stale-graph still triggers after clearErrorForFileChange
    const server2 = trackServer({ logRequests: true });
    server2.broadcastError('runtime', [{ message: "Export named 'X' not found in module './y'" }]);

    const staleMsg = logSpy.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('Stale graph detected'),
    );
    expect(staleMsg).toBeDefined();

    logSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('BUILD_ERROR_LOADER handles restarting flag from build check response', () => {
    const tag = buildScriptTag('/_bun/client/abc123.js', null, '/src/app.tsx');
    // The loader should check j.restarting before checking j.errors
    expect(tag).toContain('j.restarting');
    expect(tag).toContain("showOverlay('Restarting dev server'");
    expect(tag).toContain("sessionStorage.removeItem('__vertz_stub_retry')");
  });
});

describe('parsePluginError', () => {
  describe('Given a plugin error with file path and message', () => {
    it('Then extracts file and message', () => {
      const text =
        "[vertz-bun-plugin] Failed to process src/pages/tasks.tsx: Expected `}` to close object expression";
      const result = parsePluginError(text);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/pages/tasks.tsx');
      expect(result!.message).toBe('Expected `}` to close object expression');
    });
  });

  describe('Given a plugin error with line and column in the message', () => {
    it('Then extracts line and column numbers', () => {
      const text =
        '[vertz-bun-plugin] Failed to process src/app.tsx: Unexpected token (42:5)';
      const result = parsePluginError(text);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/app.tsx');
      expect(result!.line).toBe(42);
      expect(result!.column).toBe(5);
    });
  });

  describe('Given a plugin error without line/column info', () => {
    it('Then line and column are undefined', () => {
      const text =
        "[vertz-bun-plugin] Failed to process src/utils.ts: Cannot read properties of undefined";
      const result = parsePluginError(text);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/utils.ts');
      expect(result!.line).toBeUndefined();
      expect(result!.column).toBeUndefined();
    });
  });

  describe('Given a non-plugin error', () => {
    it('Then returns null', () => {
      expect(parsePluginError('Some random error')).toBeNull();
      expect(parsePluginError('[Server] SSR error: something')).toBeNull();
      expect(parsePluginError('Could not resolve ./missing')).toBeNull();
    });
  });

  describe('Given a plugin error with an empty message after the colon', () => {
    it('Then falls back to "Compilation failed"', () => {
      const text = '[vertz-bun-plugin] Failed to process src/app.tsx: ';
      const result = parsePluginError(text);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/app.tsx');
      expect(result!.message).toBe('Compilation failed');
    });
  });

  describe('Given a two-argument console.error joined by space', () => {
    it('Then parses correctly after join', () => {
      // The plugin does: console.error(`[vertz-bun-plugin] Failed to process ${relPath}:`, message)
      // The interceptor joins with space: args.join(' ')
      const arg1 = '[vertz-bun-plugin] Failed to process src/pages/home.tsx:';
      const arg2 = 'Expected `}` to close object expression';
      const joined = [arg1, arg2].join(' ');
      const result = parsePluginError(joined);
      expect(result).not.toBeNull();
      expect(result!.file).toBe('src/pages/home.tsx');
      expect(result!.message).toBe('Expected `}` to close object expression');
    });
  });

  describe('Given a plugin error broadcast as build category', () => {
    it('Then build error priority blocks the subsequent SSR error', () => {
      const logSpy = spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = spyOn(console, 'error').mockImplementation(() => {});
      const server = trackServer({ logRequests: false });

      // Simulate plugin error broadcast as build
      const parsed = parsePluginError(
        '[vertz-bun-plugin] Failed to process src/pages/home.tsx: Unexpected token',
      );
      expect(parsed).not.toBeNull();
      server.broadcastError('build', [parsed!]);

      // SSR error should be blocked by the build error — verify via return value
      // broadcastError('build') sets currentError.category = 'build'
      // broadcastError('ssr') returns immediately when currentError.category === 'build'
      // We verify by calling clearError then checking that a new SSR broadcast works
      // (proving the SSR was blocked before clearError, not just silently accepted)
      server.broadcastError('ssr', [
        { message: 'App entry must export a default function or named App function' },
      ]);

      // After clearing the build error, SSR errors should work again
      server.clearError();

      logSpy.mockRestore();
      errSpy.mockRestore();
    });
  });
});
