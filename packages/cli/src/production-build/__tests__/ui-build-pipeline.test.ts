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

// Mock @vertz/ui-server/bun-plugin since the real plugin requires the full compiler stack
vi.mock('@vertz/ui-server/bun-plugin', () => {
  return {
    createVertzBunPlugin: vi.fn(() => {
      const fileExtractions = new Map();
      fileExtractions.set('test.tsx', { css: '.test { color: red; }' });

      const plugin = {
        name: 'vertz-bun-plugin-mock',
        setup() {},
      };

      return { plugin, fileExtractions, cssSidecarMap: new Map() };
    }),
  };
});

// We need to mock Bun.build since we can't run the real bundler in tests
const mockBunBuild = vi.fn();

// Store original globals
const originalBunBuild = Bun.build;

describe('buildUI', () => {
  let tmpDir: string;
  let config: UIBuildConfig;

  beforeEach(() => {
    tmpDir = join(import.meta.dir, `.tmp-ui-build-test-${Date.now()}`);
    mkdirSync(join(tmpDir, 'src'), { recursive: true });

    // Create minimal project files
    writeFileSync(
      join(tmpDir, 'index.html'),
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="./public/favicon.svg" />
    <title>Test App</title>
  </head>
  <body>
    <div id="app"></div>
    <!-- Fast Refresh runtime MUST load before app to populate globalThis -->
    <script type="module" src="./node_modules/@vertz/ui-server/dist/bun-plugin/fast-refresh-runtime.js"></script>
    <script type="module" src="./src/entry-client.ts"></script>
  </body>
</html>`,
    );

    writeFileSync(join(tmpDir, 'src', 'entry-client.ts'), 'console.log("client");');
    writeFileSync(
      join(tmpDir, 'src', 'app.tsx'),
      'export default function App() { return <div />; }',
    );

    // Create public/ with favicon
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

    // Mock Bun.build to simulate successful builds
    mockBunBuild.mockImplementation(async (opts: { outdir: string; entrypoints: string[] }) => {
      // Create fake output files
      mkdirSync(opts.outdir, { recursive: true });
      const entryName =
        opts.entrypoints[0]
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') ?? 'index';

      if (opts.outdir.includes('assets')) {
        // Client build — create hashed JS file
        const jsFile = join(opts.outdir, `${entryName}-abc123.js`);
        writeFileSync(jsFile, '// built client');
        return {
          success: true,
          logs: [],
          outputs: [{ path: jsFile, kind: 'entry-point' }],
        };
      }

      // Server build
      const jsFile = join(opts.outdir, `${entryName.replace(/\.tsx?$/, '')}.js`);
      writeFileSync(jsFile, '// built server');
      return {
        success: true,
        logs: [],
        outputs: [{ path: jsFile, kind: 'entry-point' }],
      };
    });

    // Patch Bun.build
    // @ts-expect-error — overriding Bun global for test
    Bun.build = mockBunBuild;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();

    // Restore Bun globals
    // @ts-expect-error — restoring Bun global
    Bun.build = originalBunBuild;
  });

  it('should produce correct output structure', async () => {
    const result = await buildUI(config);

    expect(result.success).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);

    // Verify output structure
    expect(existsSync(join(tmpDir, 'dist', 'client', 'index.html'))).toBe(true);
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

  it('should return failure when index.html is missing', async () => {
    rmSync(join(tmpDir, 'index.html'));

    const result = await buildUI(config);

    expect(result.success).toBe(false);
    expect(result.error).toContain('index.html not found');
  });

  it('should remove Fast Refresh runtime from HTML output', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', 'index.html'), 'utf-8');
    expect(html).not.toContain('fast-refresh-runtime');
    expect(html).not.toContain('Fast Refresh runtime');
  });

  it('should inject hashed JS script tag in HTML', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', 'index.html'), 'utf-8');
    expect(html).toContain('crossorigin');
    expect(html).toContain('.js"></script>');
    expect(html).not.toContain('entry-client.ts');
  });

  it('should inject CSS link tags in HTML', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', 'index.html'), 'utf-8');
    expect(html).toContain('<link rel="stylesheet" href="/assets/vertz.css">');
  });

  it('should handle /src/entry-client.ts path prefix in HTML', async () => {
    // entity-todo uses /src/entry-client.ts (no ./ prefix)
    writeFileSync(
      join(tmpDir, 'index.html'),
      `<!doctype html>
<html lang="en">
  <head><title>Test</title></head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/entry-client.ts"></script>
  </body>
</html>`,
    );

    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', 'index.html'), 'utf-8');
    expect(html).not.toContain('entry-client.ts');
    expect(html).toContain('crossorigin');
  });

  it('should fix ./public/ asset paths to /', async () => {
    await buildUI(config);

    const html = readFileSync(join(tmpDir, 'dist', 'client', 'index.html'), 'utf-8');
    expect(html).not.toContain('./public/');
    expect(html).toContain('href="/favicon.svg"');
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
    // First call (client) succeeds, second call (server) fails
    mockBunBuild
      .mockImplementationOnce(async (opts: { outdir: string; entrypoints: string[] }) => {
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

    // First call is client build
    const clientCall = mockBunBuild.mock.calls[0][0];
    expect(clientCall.target).toBe('browser');
    expect(clientCall.minify).toBe(true);
    expect(clientCall.splitting).toBe(true);
    expect(clientCall.naming).toBe('[name]-[hash].[ext]');
  });

  it('should call Bun.build with correct server options', async () => {
    await buildUI(config);

    // Second call is server build
    const serverCall = mockBunBuild.mock.calls[1][0];
    expect(serverCall.target).toBe('bun');
    expect(serverCall.minify).toBe(false);
    expect(serverCall.naming).toBe('[name].[ext]');
    expect(serverCall.external).toEqual(['@vertz/ui', '@vertz/ui-server', '@vertz/ui-primitives']);
  });

  it('should pass JSX swap plugin to server build', async () => {
    await buildUI(config);

    const serverCall = mockBunBuild.mock.calls[1][0];
    const pluginNames = serverCall.plugins.map((p: { name: string }) => p.name);
    expect(pluginNames).toContain('vertz-ssr-jsx-swap');
  });
});
