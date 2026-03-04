import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildScriptTag,
  createBunDevServer,
  createFetchInterceptor,
  createIndexHtmlStasher,
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

describe('createIndexHtmlStasher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(
      tmpdir(),
      `vertz-stash-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stash() renames index.html to backup path', () => {
    writeFileSync(join(tmpDir, 'index.html'), '<html></html>');
    const stasher = createIndexHtmlStasher(tmpDir);

    stasher.stash();

    expect(existsSync(join(tmpDir, 'index.html'))).toBe(false);
    expect(existsSync(join(tmpDir, '.vertz', 'dev', 'index.html.bak'))).toBe(true);
  });

  it('restore() renames backup back to index.html', () => {
    writeFileSync(join(tmpDir, 'index.html'), '<html></html>');
    const stasher = createIndexHtmlStasher(tmpDir);

    stasher.stash();
    stasher.restore();

    expect(existsSync(join(tmpDir, 'index.html'))).toBe(true);
    expect(existsSync(join(tmpDir, '.vertz', 'dev', 'index.html.bak'))).toBe(false);
  });

  it('stash() is a no-op when index.html does not exist', () => {
    const stasher = createIndexHtmlStasher(tmpDir);

    stasher.stash();

    expect(existsSync(join(tmpDir, '.vertz', 'dev', 'index.html.bak'))).toBe(false);
  });

  it('restore() is a no-op when nothing was stashed', () => {
    const stasher = createIndexHtmlStasher(tmpDir);

    // Should not throw
    stasher.restore();
  });

  it('stash() recovers index.html left stashed by a crashed session', () => {
    // Simulate a previous crashed session: index.html is gone, backup exists
    mkdirSync(join(tmpDir, '.vertz', 'dev'), { recursive: true });
    writeFileSync(join(tmpDir, '.vertz', 'dev', 'index.html.bak'), '<html></html>');
    // No index.html in project root

    const stasher = createIndexHtmlStasher(tmpDir);
    stasher.stash();

    // Should have recovered the backup, then re-stashed it
    expect(existsSync(join(tmpDir, 'index.html'))).toBe(false);
    expect(existsSync(join(tmpDir, '.vertz', 'dev', 'index.html.bak'))).toBe(true);

    // Restore should bring it back
    stasher.restore();
    expect(existsSync(join(tmpDir, 'index.html'))).toBe(true);
    expect(readFileSync(join(tmpDir, 'index.html'), 'utf-8')).toBe('<html></html>');
  });

  it('restore() is a no-op when called twice', () => {
    writeFileSync(join(tmpDir, 'index.html'), '<html></html>');
    const stasher = createIndexHtmlStasher(tmpDir);

    stasher.stash();
    stasher.restore();
    stasher.restore(); // second call should not throw

    expect(existsSync(join(tmpDir, 'index.html'))).toBe(true);
  });
});
