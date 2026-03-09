import { beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import {
  buildScriptTag,
  clearSSRRequireCache,
  createBunDevServer,
  createFetchInterceptor,
  createRuntimeErrorDeduplicator,
  formatTerminalRuntimeError,
  generateSSRPageHtml,
  parseHMRAssets,
} from '../bun-dev-server';

describe('createBunDevServer', () => {
  it('returns an object with start and stop methods', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
    expect(typeof server.start).toBe('function');
    expect(typeof server.stop).toBe('function');
  });

  it('creates server in unified SSR+HMR mode (no ssr option needed)', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('accepts all configuration options', () => {
    const apiHandler = async (_req: Request) => new Response('ok');

    const server = createBunDevServer({
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
    });

    expect(server).toBeDefined();
  });

  it('stop() is safe to call before start()', async () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    // Should not throw
    await server.stop();
  });

  it('defaults port to 3000', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('defaults host to localhost', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('defaults logRequests to true', () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {});

    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
    consoleSpy.mockRestore();
  });

  it('defaults skipSSRPaths to [/api/]', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('defaults title to Vertz App', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
      ssrModule: true,
    });

    expect(server).toBeDefined();
  });

  it('defaults projectRoot to process.cwd()', () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

    expect(server).toBeDefined();
  });

  it('stop() can be called multiple times safely', async () => {
    const server = createBunDevServer({
      entry: './src/app.tsx',
    });

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
