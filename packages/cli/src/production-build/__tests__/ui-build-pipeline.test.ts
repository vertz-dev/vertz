/**
 * UI Build Pipeline Tests
 *
 * Integration tests for buildUI() — validates the full client + server
 * production build pipeline for UI apps.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildUI, type UIBuildConfig } from '../ui-build-pipeline';

// ── Module mocks ────────────────────────────────────────────────────

const mockGenerateRouteChunkManifest = vi.fn(
  () => ({ routes: {} }) as { routes: Record<string, string[]> },
);

vi.mock('../route-chunk-manifest', () => ({
  generateRouteChunkManifest: (...args: unknown[]) => mockGenerateRouteChunkManifest(...args),
}));

const mockCreateVertzBunPlugin = vi.fn(() => {
  const fileExtractions = new Map();
  fileExtractions.set('test.tsx', { css: '.test { color: red; }' });
  const plugin = { name: 'vertz-bun-plugin-mock', setup() {} };
  return { plugin, fileExtractions, cssSidecarMap: new Map() };
});

vi.mock('@vertz/ui-server/bun-plugin', () => ({
  createVertzBunPlugin: (...args: unknown[]) => mockCreateVertzBunPlugin(...args),
}));

const mockGenerateAotBuildManifest = vi.fn(() => ({
  components: {},
  classificationLog: [],
}));

const mockExtractFontMetrics = vi.fn(async () => ({}));

vi.mock('@vertz/ui-server', () => ({
  generateAotBuildManifest: (...args: unknown[]) => mockGenerateAotBuildManifest(...args),
  extractFontMetrics: (...args: unknown[]) => mockExtractFontMetrics(...args),
}));

const mockDiscoverRoutes = vi.fn(async () => [] as string[]);
const mockFilterPrerenderableRoutes = vi.fn((patterns: string[]) =>
  patterns.filter((p) => !p.includes(':')),
);
const mockCollectPrerenderPaths = vi.fn(async () => [] as string[]);
const mockPrerenderRoutes = vi.fn(async () => [] as Array<{ path: string; html: string }>);
const mockStripScriptsFromStaticHTML = vi.fn((html: string) =>
  html.replace(/<script[^>]*>.*?<\/script>/g, ''),
);

vi.mock('@vertz/ui-server/ssr', () => ({
  createSSRHandler: vi.fn(() => async () => new Response('ssr-mock')),
  collectPrerenderPaths: (...args: unknown[]) => mockCollectPrerenderPaths(...args),
  discoverRoutes: (...args: unknown[]) => mockDiscoverRoutes(...args),
  filterPrerenderableRoutes: (...args: unknown[]) =>
    mockFilterPrerenderableRoutes(...(args as [string[]])),
  prerenderRoutes: (...args: unknown[]) => mockPrerenderRoutes(...args),
  stripScriptsFromStaticHTML: (...args: unknown[]) =>
    mockStripScriptsFromStaticHTML(...(args as [string])),
}));

// ── Bun.build mock ─────────────────────────────────────────────────

const mockBunBuild = vi.fn();
const originalBunBuild = Bun.build;

/** Default Bun.build mock that creates fake output files. */
function defaultBunBuildImpl(opts: { outdir: string; entrypoints: string[] }) {
  mkdirSync(opts.outdir, { recursive: true });
  const entryName =
    opts.entrypoints[0]
      .split('/')
      .pop()
      ?.replace(/\.[^.]+$/, '') ?? 'index';

  if (opts.outdir.includes('assets')) {
    const jsFile = join(opts.outdir, `${entryName}-abc123.js`);
    writeFileSync(jsFile, '// built client');
    return {
      success: true,
      logs: [],
      outputs: [{ path: jsFile, kind: 'entry-point' }],
    };
  }

  const jsFile = join(opts.outdir, `${entryName.replace(/\.tsx?$/, '')}.js`);
  writeFileSync(jsFile, 'export default {};');
  return {
    success: true,
    logs: [],
    outputs: [{ path: jsFile, kind: 'entry-point' }],
  };
}

// ── Test suite ──────────────────────────────────────────────────────

describe('buildUI', () => {
  let tmpDir: string;
  let config: UIBuildConfig;

  beforeEach(() => {
    tmpDir = join(import.meta.dir, `.tmp-ui-build-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'src'), { recursive: true });

    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');
    writeFileSync(
      join(tmpDir, 'src', 'app.tsx'),
      'export default function App() { return <div />; }',
    );

    mkdirSync(join(tmpDir, 'public'), { recursive: true });
    writeFileSync(join(tmpDir, 'public', 'favicon.svg'), '<svg></svg>');

    config = {
      projectRoot: tmpDir,
      clientEntry: join(tmpDir, 'src', 'entry-client.ts'),
      serverEntry: join(tmpDir, 'src', 'app.tsx'),
      outputDir: 'dist',
      minify: true,
      sourcemap: false,
    };

    // Reset all mock implementations to defaults
    mockBunBuild.mockImplementation(defaultBunBuildImpl);
    mockCreateVertzBunPlugin.mockImplementation(() => {
      const fileExtractions = new Map();
      fileExtractions.set('test.tsx', { css: '.test { color: red; }' });
      const plugin = { name: 'vertz-bun-plugin-mock', setup() {} };
      return { plugin, fileExtractions, cssSidecarMap: new Map() };
    });
    mockGenerateAotBuildManifest.mockReturnValue({
      components: {},
      classificationLog: [],
    });
    mockExtractFontMetrics.mockResolvedValue({});
    mockDiscoverRoutes.mockResolvedValue([]);
    mockFilterPrerenderableRoutes.mockImplementation((patterns: string[]) =>
      patterns.filter((p) => !p.includes(':')),
    );
    mockCollectPrerenderPaths.mockResolvedValue([]);
    mockPrerenderRoutes.mockResolvedValue([]);
    mockGenerateRouteChunkManifest.mockReturnValue({ routes: {} });

    // @ts-expect-error — overriding Bun global for test
    Bun.build = mockBunBuild;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockBunBuild.mockReset();
    // @ts-expect-error — restoring Bun global
    Bun.build = originalBunBuild;
  });

  it('should produce correct output structure', async () => {
    const result = await buildUI(config);

    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(existsSync(join(tmpDir, 'dist', 'client', '_shell.html'))).toBe(true);
    expect(existsSync(join(tmpDir, 'dist', 'client', 'assets'))).toBe(true);
    expect(existsSync(join(tmpDir, 'dist', 'server'))).toBe(true);
  });

  it('should copy public/ assets to dist/client/', async () => {
    await buildUI(config);

    expect(existsSync(join(tmpDir, 'dist', 'client', 'favicon.svg'))).toBe(true);
    const content = readFileSync(join(tmpDir, 'dist', 'client', 'favicon.svg'), 'utf-8');
    expect(content).toBe('<svg></svg>');
  });

  it('should succeed without public/ directory', async () => {
    rmSync(join(tmpDir, 'public'), { recursive: true, force: true });
    const result = await buildUI(config);
    expect(result.success).toBe(true);
  });

  it('should generate HTML with hashed JS script tag', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('crossorigin');
    expect(html).toContain('.js"></script>');
    expect(html).not.toContain('entry-client.ts');
  });

  it('should generate HTML with CSS link tags', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<link rel="stylesheet" href="/assets/vertz.css">');
  });

  it('should generate HTML with default title', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<title>Vertz App</title>');
  });

  it('should generate HTML with custom title', async () => {
    await buildUI({ ...config, title: 'My Todo App' });

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<title>My Todo App</title>');
  });

  it('should generate valid HTML structure', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<meta charset="UTF-8"');
    expect(html).toContain('viewport');
  });

  it('should not contain any dev-only artifacts in HTML', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).not.toContain('fast-refresh-runtime');
    expect(html).not.toContain('Fast Refresh runtime');
    expect(html).not.toContain('./public/');
  });

  it('should return failure when client build fails', async () => {
    mockBunBuild.mockResolvedValueOnce({
      success: false,
      logs: [{ message: 'Syntax error' }],
      outputs: [],
    });

    const result = await buildUI(config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Client build failed');
    expect(result.error).toContain('Syntax error');
  });

  it('should return failure when server build fails', async () => {
    mockBunBuild
      .mockImplementationOnce((opts: { outdir: string; entrypoints: string[] }) => {
        mkdirSync(opts.outdir, { recursive: true });
        const jsFile = join(opts.outdir, 'entry-client-abc123.js');
        writeFileSync(jsFile, '// built');
        return {
          success: true,
          logs: [],
          outputs: [{ path: jsFile, kind: 'entry-point' }],
        };
      })
      .mockResolvedValueOnce({
        success: false,
        logs: [{ message: 'SSR import error' }],
        outputs: [],
      });

    const result = await buildUI(config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Server build failed');
  });

  it('should call Bun.build with correct client options', async () => {
    await buildUI(config);

    const clientCall = mockBunBuild.mock.calls[0][0];
    expect(clientCall.target).toBe('browser');
    expect(clientCall.minify).toBe(true);
    expect(clientCall.splitting).toBe(true);
    expect(clientCall.naming).toBe('[name]-[hash].[ext]');
  });

  it('should call Bun.build with correct server options', async () => {
    await buildUI(config);

    const serverCall = mockBunBuild.mock.calls[1][0];
    expect(serverCall.target).toBe('bun');
    expect(serverCall.minify).toBe(false);
    expect(serverCall.naming).toBe('[name].[ext]');
    expect(serverCall.external).toEqual([
      '@vertz/ui',
      '@vertz/ui-server',
      '@vertz/ui-primitives',
      'vertz',
    ]);
  });

  it('should pass JSX swap plugin to server build', async () => {
    await buildUI(config);

    const serverCall = mockBunBuild.mock.calls[1][0];
    const pluginNames = serverCall.plugins.map((p: { name: string }) => p.name);
    expect(pluginNames).toContain('vertz-ssr-jsx-swap');
  });

  it('should configure JSX swap plugin to rewrite jsx-runtime imports', async () => {
    await buildUI(config);

    const serverCall = mockBunBuild.mock.calls[1][0];
    const jsxSwapPlugin = serverCall.plugins.find(
      (p: { name: string }) => p.name === 'vertz-ssr-jsx-swap',
    );
    expect(jsxSwapPlugin).toBeDefined();

    // Invoke setup to exercise the onResolve callbacks
    const resolvers: Array<{
      filter: RegExp;
      cb: (args: { path: string }) => { path: string; external: boolean };
    }> = [];
    const fakeBuild = {
      onResolve: (
        opts: { filter: RegExp },
        cb: (args: { path: string }) => { path: string; external: boolean },
      ) => {
        resolvers.push({ filter: opts.filter, cb });
      },
    };
    jsxSwapPlugin.setup(fakeBuild);

    expect(resolvers).toHaveLength(2);

    // Test jsx-runtime swap
    const jsxResult = resolvers[0].cb({ path: '@vertz/ui/jsx-runtime' });
    expect(jsxResult.path).toBe('@vertz/ui-server/jsx-runtime');
    expect(jsxResult.external).toBe(true);

    // Test jsx-dev-runtime swap
    const devResult = resolvers[1].cb({ path: '@vertz/ui/jsx-dev-runtime' });
    expect(devResult.path).toBe('@vertz/ui-server/jsx-runtime');
    expect(devResult.external).toBe(true);
  });

  it('should inject modulepreload links for JS chunks in HTML shell', async () => {
    mockBunBuild
      .mockImplementationOnce((opts: { outdir: string }) => {
        mkdirSync(opts.outdir, { recursive: true });
        const entryFile = join(opts.outdir, 'entry-client-abc123.js');
        const chunk1 = join(opts.outdir, 'chunk-def456.js');
        const chunk2 = join(opts.outdir, 'chunk-ghi789.js');
        writeFileSync(entryFile, '// entry');
        writeFileSync(chunk1, '// chunk 1');
        writeFileSync(chunk2, '// chunk 2');
        return {
          success: true,
          logs: [],
          outputs: [
            { path: entryFile, kind: 'entry-point' },
            { path: chunk1, kind: 'chunk' },
            { path: chunk2, kind: 'chunk' },
          ],
        };
      })
      .mockImplementationOnce((opts: { outdir: string }) => {
        mkdirSync(opts.outdir, { recursive: true });
        const jsFile = join(opts.outdir, 'app.js');
        writeFileSync(jsFile, '// server');
        return { success: true, logs: [], outputs: [{ path: jsFile, kind: 'entry-point' }] };
      });

    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<link rel="modulepreload" href="/assets/chunk-def456.js">');
    expect(html).toContain('<link rel="modulepreload" href="/assets/chunk-ghi789.js">');
  });

  // ── CSS output collection ─────────────────────────────────────────

  it('should collect CSS output files from client build', async () => {
    mockBunBuild
      .mockImplementationOnce((opts: { outdir: string }) => {
        mkdirSync(opts.outdir, { recursive: true });
        const entryFile = join(opts.outdir, 'entry-client-abc123.js');
        const cssFile = join(opts.outdir, 'styles-xyz789.css');
        writeFileSync(entryFile, '// entry');
        writeFileSync(cssFile, 'body { margin: 0; }');
        return {
          success: true,
          logs: [],
          outputs: [
            { path: entryFile, kind: 'entry-point' },
            { path: cssFile, kind: 'asset' },
          ],
        };
      })
      .mockImplementationOnce((opts: { outdir: string }) => {
        mkdirSync(opts.outdir, { recursive: true });
        writeFileSync(join(opts.outdir, 'app.js'), '// server');
        return {
          success: true,
          logs: [],
          outputs: [{ path: join(opts.outdir, 'app.js'), kind: 'entry-point' }],
        };
      });

    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('styles-xyz789.css');
    expect(html).toContain('vertz.css');
  });

  // ── HTML meta tags ────────────────────────────────────────────────

  it('should include description meta tag when provided', async () => {
    await buildUI({ ...config, description: 'A great app' });

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<meta name="description" content="A great app"');
  });

  it('should escape quotes in description meta tag', async () => {
    await buildUI({ ...config, description: 'She said "hello"' });

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('content="She said &quot;hello&quot;"');
  });

  it('should include site.webmanifest link when present', async () => {
    writeFileSync(join(tmpDir, 'public', 'site.webmanifest'), '{}');
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest">');
  });

  it('should include favicon link when present', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg">');
  });

  it('should include theme-color meta tag', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', '_shell.html'), 'utf-8');
    expect(html).toContain('<meta name="theme-color" content="#0a0a0b">');
  });

  // ── Sourcemap option ──────────────────────────────────────────────

  it('should pass sourcemap=external when enabled', async () => {
    await buildUI({ ...config, sourcemap: true });

    const clientCall = mockBunBuild.mock.calls[0][0];
    expect(clientCall.sourcemap).toBe('external');
  });

  it('should pass sourcemap=none when disabled', async () => {
    await buildUI({ ...config, sourcemap: false });

    const clientCall = mockBunBuild.mock.calls[0][0];
    expect(clientCall.sourcemap).toBe('none');
  });

  // ── Optimized images copy ─────────────────────────────────────────

  it('should copy optimized images from .vertz/images/', async () => {
    const imagesDir = join(tmpDir, '.vertz', 'images');
    mkdirSync(imagesDir, { recursive: true });
    writeFileSync(join(imagesDir, 'logo.webp'), 'fake-image-data');

    await buildUI(config);

    const imgDest = join(tmpDir, 'dist', 'client', '__vertz_img', 'logo.webp');
    expect(existsSync(imgDest)).toBe(true);
    expect(readFileSync(imgDest, 'utf-8')).toBe('fake-image-data');
  });

  it('should skip image copy when .vertz/images/ does not exist', async () => {
    await buildUI(config);
    expect(existsSync(join(tmpDir, 'dist', 'client', '__vertz_img'))).toBe(false);
  });

  // ── Top-level error handling ──────────────────────────────────────

  it('should handle top-level exception gracefully', async () => {
    mockCreateVertzBunPlugin.mockImplementation(() => {
      throw new Error('Plugin init failed');
    });

    const result = await buildUI(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Plugin init failed');
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('should handle non-Error exceptions in top-level catch', async () => {
    mockCreateVertzBunPlugin.mockImplementation(() => {
      throw 'string error';
    });

    const result = await buildUI(config);

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });

  // ── AOT manifest generation ───────────────────────────────────────

  describe('AOT manifest generation', () => {
    it('should write AOT manifest when components found', async () => {
      mockGenerateAotBuildManifest.mockReturnValue({
        components: { App: { type: 'client' }, Header: { type: 'server' } },
        classificationLog: ['App → client', 'Header → server'],
      });

      const result = await buildUI(config);
      expect(result.success).toBe(true);

      const aotPath = join(tmpDir, 'dist', 'server', 'aot-manifest.json');
      expect(existsSync(aotPath)).toBe(true);
      const aotContent = JSON.parse(readFileSync(aotPath, 'utf-8'));
      expect(aotContent).toEqual({ App: { type: 'client' }, Header: { type: 'server' } });
    });

    it('should skip AOT manifest when no components found', async () => {
      mockGenerateAotBuildManifest.mockReturnValue({
        components: {},
        classificationLog: [],
      });

      const result = await buildUI(config);
      expect(result.success).toBe(true);

      const aotPath = join(tmpDir, 'dist', 'server', 'aot-manifest.json');
      expect(existsSync(aotPath)).toBe(false);
    });

    it('should handle AOT manifest generation failure gracefully', async () => {
      mockGenerateAotBuildManifest.mockImplementation(() => {
        throw new Error('AOT analysis crashed');
      });

      const result = await buildUI(config);
      // Build should still succeed — AOT failure is non-fatal
      expect(result.success).toBe(true);
    });
  });

  // ── Pre-rendering ─────────────────────────────────────────────────

  describe('pre-rendering', () => {
    it('should handle SSR module import failure gracefully', async () => {
      // Write invalid JS so import() throws
      mockBunBuild
        .mockImplementationOnce(defaultBunBuildImpl)
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const jsFile = join(opts.outdir, 'app.js');
          writeFileSync(jsFile, '{{{{ INVALID SYNTAX');
          return {
            success: true,
            logs: [],
            outputs: [{ path: jsFile, kind: 'entry-point' }],
          };
        });

      const result = await buildUI(config);
      // Should succeed even without pre-rendering
      expect(result.success).toBe(true);
    });

    it('should handle route discovery failure gracefully', async () => {
      mockDiscoverRoutes.mockRejectedValue(new Error('Route discovery error'));

      const result = await buildUI(config);
      expect(result.success).toBe(true);
    });

    it('should pre-render static routes when discovered', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/', '/about']);
      mockFilterPrerenderableRoutes.mockReturnValue(['/', '/about']);
      mockPrerenderRoutes.mockResolvedValue([
        { path: '/', html: '<html><body>Home</body></html>' },
        { path: '/about', html: '<html><body>About</body></html>' },
      ]);

      const result = await buildUI(config);
      expect(result.success).toBe(true);

      const indexHtml = join(tmpDir, 'dist', 'client', 'index.html');
      expect(existsSync(indexHtml)).toBe(true);
      expect(readFileSync(indexHtml, 'utf-8')).toContain('Home');

      const aboutHtml = join(tmpDir, 'dist', 'client', 'about', 'index.html');
      expect(existsSync(aboutHtml)).toBe(true);
      expect(readFileSync(aboutHtml, 'utf-8')).toContain('About');
    });

    it('should handle empty route discovery', async () => {
      mockDiscoverRoutes.mockResolvedValue([]);

      const result = await buildUI(config);
      expect(result.success).toBe(true);
    });

    it('should collect dynamic routes from generateParams', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/', '/posts/:id']);
      mockFilterPrerenderableRoutes.mockReturnValue(['/']);
      mockCollectPrerenderPaths.mockResolvedValue(['/posts/1', '/posts/2']);
      mockPrerenderRoutes.mockResolvedValue([
        { path: '/', html: '<html>Home</html>' },
        { path: '/posts/1', html: '<html>Post 1</html>' },
        { path: '/posts/2', html: '<html>Post 2</html>' },
      ]);

      // Server build writes a module that exports routes
      mockBunBuild
        .mockImplementationOnce((opts: { outdir: string; entrypoints: string[] }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const jsFile = join(opts.outdir, 'entry-client-abc123.js');
          writeFileSync(jsFile, '// client');
          return {
            success: true,
            logs: [],
            outputs: [{ path: jsFile, kind: 'entry-point' }],
          };
        })
        .mockImplementationOnce((opts: { outdir: string; entrypoints: string[] }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const jsFile = join(opts.outdir, 'app.js');
          writeFileSync(
            jsFile,
            'export const routes = { "/posts/:id": { generateParams: () => [{ id: "1" }, { id: "2" }] } };',
          );
          return { success: true, logs: [], outputs: [{ path: jsFile, kind: 'entry-point' }] };
        });

      const result = await buildUI(config);
      expect(result.success).toBe(true);
    });

    it('should strip scripts from static HTML in islands mode', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/']);
      mockFilterPrerenderableRoutes.mockReturnValue(['/']);
      mockPrerenderRoutes.mockResolvedValue([
        {
          path: '/',
          html: '<html><body><div data-v-island>content</div><script>alert(1)</script></body></html>',
        },
      ]);

      const result = await buildUI(config);
      expect(result.success).toBe(true);

      const indexHtml = join(tmpDir, 'dist', 'client', 'index.html');
      expect(existsSync(indexHtml)).toBe(true);
      const content = readFileSync(indexHtml, 'utf-8');
      expect(content).toContain('data-v-island');
      expect(content).not.toContain('<script>alert(1)</script>');
    });

    it('should not strip scripts from non-islands mode HTML', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/']);
      mockFilterPrerenderableRoutes.mockReturnValue(['/']);
      mockPrerenderRoutes.mockResolvedValue([
        { path: '/', html: '<html><body>No islands here<script>app()</script></body></html>' },
      ]);

      const result = await buildUI(config);
      expect(result.success).toBe(true);

      const indexHtml = join(tmpDir, 'dist', 'client', 'index.html');
      expect(existsSync(indexHtml)).toBe(true);
      const content = readFileSync(indexHtml, 'utf-8');
      // Script should NOT be stripped (no data-v-island → not islands mode)
      expect(content).toContain('<script>app()</script>');
    });

    it('should handle discovered routes with only dynamic patterns', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/users/:id']);
      mockFilterPrerenderableRoutes.mockReturnValue([]);

      const result = await buildUI(config);
      expect(result.success).toBe(true);
    });

    it('should extract font metrics when SSR module exports theme.fonts', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/']);
      mockFilterPrerenderableRoutes.mockReturnValue(['/']);
      mockPrerenderRoutes.mockResolvedValue([{ path: '/', html: '<html>Home</html>' }]);
      mockExtractFontMetrics.mockResolvedValue({ Inter: { ascent: 2048 } });

      // Server build writes a module that exports theme with fonts
      mockBunBuild
        .mockImplementationOnce(defaultBunBuildImpl)
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const jsFile = join(opts.outdir, 'app.js');
          writeFileSync(jsFile, 'export const theme = { fonts: [{ family: "Inter" }] };');
          return {
            success: true,
            logs: [],
            outputs: [{ path: jsFile, kind: 'entry-point' }],
          };
        });

      const result = await buildUI(config);
      expect(result.success).toBe(true);
      expect(mockExtractFontMetrics).toHaveBeenCalled();
    });

    it('should handle font metrics extraction failure gracefully', async () => {
      mockDiscoverRoutes.mockResolvedValue(['/']);
      mockFilterPrerenderableRoutes.mockReturnValue(['/']);
      mockPrerenderRoutes.mockResolvedValue([{ path: '/', html: '<html>Home</html>' }]);
      mockExtractFontMetrics.mockRejectedValue(new Error('Font analysis failed'));

      // Server build writes a module that exports theme with fonts
      mockBunBuild
        .mockImplementationOnce(defaultBunBuildImpl)
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const jsFile = join(opts.outdir, 'app.js');
          writeFileSync(jsFile, 'export const theme = { fonts: [{ family: "Inter" }] };');
          return {
            success: true,
            logs: [],
            outputs: [{ path: jsFile, kind: 'entry-point' }],
          };
        });

      const result = await buildUI(config);
      // Build should still succeed — font metric failure is non-fatal
      expect(result.success).toBe(true);
    });
  });

  // ── Brotli compression ────────────────────────────────────────────

  describe('brotli compression', () => {
    it('should create .br files for eligible files over min size', async () => {
      // Override client build to create a large JS file
      mockBunBuild
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const jsFile = join(opts.outdir, 'entry-client-abc123.js');
          // Write a file larger than 256 bytes (the MIN_COMPRESS_SIZE)
          writeFileSync(jsFile, 'x'.repeat(500));
          return {
            success: true,
            logs: [],
            outputs: [{ path: jsFile, kind: 'entry-point' }],
          };
        })
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          writeFileSync(join(opts.outdir, 'app.js'), '// server');
          return {
            success: true,
            logs: [],
            outputs: [{ path: join(opts.outdir, 'app.js'), kind: 'entry-point' }],
          };
        });

      await buildUI(config);

      const brFile = join(tmpDir, 'dist', 'client', 'assets', 'entry-client-abc123.js.br');
      expect(existsSync(brFile)).toBe(true);
    });

    it('should not create .br for files under minimum size', async () => {
      // Default mock creates tiny files (< 256 bytes)
      await buildUI(config);

      const brFile = join(tmpDir, 'dist', 'client', 'assets', 'entry-client-abc123.js.br');
      expect(existsSync(brFile)).toBe(false);
    });

    it('should skip non-compressible extensions', async () => {
      // Write a large PNG file to dist after build
      mkdirSync(join(tmpDir, 'public'), { recursive: true });
      writeFileSync(join(tmpDir, 'public', 'image.png'), 'x'.repeat(500));

      await buildUI(config);

      // .png is not in the compressible extensions list
      expect(existsSync(join(tmpDir, 'dist', 'client', 'image.png.br'))).toBe(false);
    });
  });

  // ── Route chunk manifest ──────────────────────────────────────────

  describe('route chunk manifest', () => {
    it('should write route-chunk-manifest.json when routes are found', async () => {
      // Return a manifest with actual routes
      mockGenerateRouteChunkManifest.mockReturnValue({
        routes: { '/': ['/assets/chunk-abc.js'], '/about': ['/assets/chunk-def.js'] },
      });

      mockBunBuild
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const entryFile = join(opts.outdir, 'entry-client-abc123.js');
          const chunk1 = join(opts.outdir, 'chunk-abc.js');
          writeFileSync(entryFile, '// entry with routes');
          writeFileSync(chunk1, '// chunk');
          return {
            success: true,
            logs: [],
            outputs: [
              { path: entryFile, kind: 'entry-point' },
              { path: chunk1, kind: 'chunk' },
            ],
          };
        })
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          writeFileSync(join(opts.outdir, 'app.js'), '// server');
          return {
            success: true,
            logs: [],
            outputs: [{ path: join(opts.outdir, 'app.js'), kind: 'entry-point' }],
          };
        });

      const result = await buildUI(config);
      expect(result.success).toBe(true);

      const manifestPath = join(tmpDir, 'dist', 'client', 'route-chunk-manifest.json');
      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      expect(manifest.routes['/']).toEqual(['/assets/chunk-abc.js']);
    });

    it('should skip manifest when no chunks are present', async () => {
      await buildUI(config);

      const manifestPath = join(tmpDir, 'dist', 'client', 'route-chunk-manifest.json');
      expect(existsSync(manifestPath)).toBe(false);
    });

    it('should skip manifest when generateRouteChunkManifest returns empty routes', async () => {
      mockGenerateRouteChunkManifest.mockReturnValue({ routes: {} });

      mockBunBuild
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          const entryFile = join(opts.outdir, 'entry-client-abc123.js');
          const chunk1 = join(opts.outdir, 'chunk-abc.js');
          writeFileSync(entryFile, '// entry');
          writeFileSync(chunk1, '// chunk');
          return {
            success: true,
            logs: [],
            outputs: [
              { path: entryFile, kind: 'entry-point' },
              { path: chunk1, kind: 'chunk' },
            ],
          };
        })
        .mockImplementationOnce((opts: { outdir: string }) => {
          mkdirSync(opts.outdir, { recursive: true });
          writeFileSync(join(opts.outdir, 'app.js'), '// server');
          return {
            success: true,
            logs: [],
            outputs: [{ path: join(opts.outdir, 'app.js'), kind: 'entry-point' }],
          };
        });

      await buildUI(config);

      const manifestPath = join(tmpDir, 'dist', 'client', 'route-chunk-manifest.json');
      expect(existsSync(manifestPath)).toBe(false);
    });
  });
});
