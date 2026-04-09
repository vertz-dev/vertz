/**
 * Start Command Tests
 *
 * Tests for the vertz start CLI command.
 * Tests validation, discovery, and server startup logic.
 *
 * NOTE: vi.mock is used for @vertz/ui-server/ssr because:
 * 1. startAction's internal functions use `await import('@vertz/ui-server/ssr')`
 * 2. ui-build-pipeline.test.ts mocks this module without createSSRHandler
 * 3. We need createSSRHandler available for the server startup tests
 */

import type { MockFunction } from '@vertz/test';
import { afterEach, beforeEach, describe, expect, it, vi } from '@vertz/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Provide createSSRHandler in the mock so tests work regardless of file execution order.
// Another test file (ui-build-pipeline.test.ts) mocks this module without createSSRHandler,
// which would break our server startup tests when the full suite runs together.
vi.mock('@vertz/ui-server/ssr', () => ({
  createSSRHandler: vi.fn(() => async (_req: Request) => new Response('ssr-mock')),
  loadAotManifest: vi.fn(async () => null),
  collectPrerenderPaths: async () => [],
  discoverRoutes: async () => [],
  filterPrerenderableRoutes: (patterns: string[]) => patterns,
  prerenderRoutes: async () => [],
  stripScriptsFromStaticHTML: (html: string) => html.replace(/<script[^>]*>.*?<\/script>/g, ''),
}));

import {
  discoverInlineCSS,
  discoverSSRModule,
  servePrerenderHTML,
  serveStaticFile,
  startAction,
  validateBuildOutputs,
} from '../start';

describe('discoverSSRModule', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'vertz-start-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns undefined when dist/server/ does not exist', () => {
    expect(discoverSSRModule(projectRoot)).toBeUndefined();
  });

  it('returns undefined when dist/server/ is empty', () => {
    mkdirSync(join(projectRoot, 'dist', 'server'), { recursive: true });
    expect(discoverSSRModule(projectRoot)).toBeUndefined();
  });

  it('finds a single .js file in dist/server/', () => {
    mkdirSync(join(projectRoot, 'dist', 'server'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'server', 'index.js'), 'export default {}');
    expect(discoverSSRModule(projectRoot)).toBe(join(projectRoot, 'dist', 'server', 'index.js'));
  });

  it('prefers app.js over other files', () => {
    mkdirSync(join(projectRoot, 'dist', 'server'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'server', 'index.js'), 'export default {}');
    writeFileSync(join(projectRoot, 'dist', 'server', 'app.js'), 'export default {}');
    expect(discoverSSRModule(projectRoot)).toBe(join(projectRoot, 'dist', 'server', 'app.js'));
  });
});

describe('validateBuildOutputs', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'vertz-start-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns err when api-only build output is missing', () => {
    const result = validateBuildOutputs(projectRoot, 'api-only');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('.vertz/build/index.js');
    }
  });

  it('returns ok when api-only build output exists', () => {
    mkdirSync(join(projectRoot, '.vertz', 'build'), { recursive: true });
    writeFileSync(join(projectRoot, '.vertz', 'build', 'index.js'), 'export default {}');
    const result = validateBuildOutputs(projectRoot, 'api-only');
    expect(result.ok).toBe(true);
  });

  it('returns err when ui-only client output is missing', () => {
    const result = validateBuildOutputs(projectRoot, 'ui-only');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('dist/client/_shell.html');
    }
  });

  it('returns err when ui-only server output is missing', () => {
    mkdirSync(join(projectRoot, 'dist', 'client'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'client', 'index.html'), '<html></html>');
    const result = validateBuildOutputs(projectRoot, 'ui-only');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('dist/server/');
    }
  });

  it('returns ok when ui-only build outputs exist', () => {
    mkdirSync(join(projectRoot, 'dist', 'client'), { recursive: true });
    mkdirSync(join(projectRoot, 'dist', 'server'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'client', 'index.html'), '<html></html>');
    writeFileSync(join(projectRoot, 'dist', 'server', 'app.js'), 'export default {}');
    const result = validateBuildOutputs(projectRoot, 'ui-only');
    expect(result.ok).toBe(true);
  });

  it('returns err when full-stack API build is missing', () => {
    mkdirSync(join(projectRoot, 'dist', 'client'), { recursive: true });
    mkdirSync(join(projectRoot, 'dist', 'server'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'client', 'index.html'), '<html></html>');
    writeFileSync(join(projectRoot, 'dist', 'server', 'app.js'), 'export default {}');
    const result = validateBuildOutputs(projectRoot, 'full-stack');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('.vertz/build/index.js');
    }
  });

  it('returns ok when full-stack build outputs exist', () => {
    mkdirSync(join(projectRoot, '.vertz', 'build'), { recursive: true });
    mkdirSync(join(projectRoot, 'dist', 'client'), { recursive: true });
    mkdirSync(join(projectRoot, 'dist', 'server'), { recursive: true });
    writeFileSync(join(projectRoot, '.vertz', 'build', 'index.js'), 'export default {}');
    writeFileSync(join(projectRoot, 'dist', 'client', 'index.html'), '<html></html>');
    writeFileSync(join(projectRoot, 'dist', 'server', 'app.js'), 'export default {}');
    const result = validateBuildOutputs(projectRoot, 'full-stack');
    expect(result.ok).toBe(true);
  });
});

describe('discoverInlineCSS', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'vertz-start-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('returns undefined when dist/client/assets/ does not exist', () => {
    expect(discoverInlineCSS(projectRoot)).toBeUndefined();
  });

  it('returns undefined when assets dir has no CSS files', () => {
    mkdirSync(join(projectRoot, 'dist', 'client', 'assets'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'client', 'assets', 'app.js'), 'console.log()');
    expect(discoverInlineCSS(projectRoot)).toBeUndefined();
  });

  it('returns a map of CSS file paths to contents', () => {
    mkdirSync(join(projectRoot, 'dist', 'client', 'assets'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'client', 'assets', 'style-abc.css'), 'body{margin:0}');
    writeFileSync(join(projectRoot, 'dist', 'client', 'assets', 'theme-def.css'), ':root{--c:red}');
    const result = discoverInlineCSS(projectRoot);
    expect(result).toEqual({
      '/assets/style-abc.css': 'body{margin:0}',
      '/assets/theme-def.css': ':root{--c:red}',
    });
  });

  it('ignores non-CSS files in the assets directory', () => {
    mkdirSync(join(projectRoot, 'dist', 'client', 'assets'), { recursive: true });
    writeFileSync(join(projectRoot, 'dist', 'client', 'assets', 'main.css'), 'h1{color:blue}');
    writeFileSync(join(projectRoot, 'dist', 'client', 'assets', 'chunk.js'), 'export{}');
    const result = discoverInlineCSS(projectRoot);
    expect(result).toEqual({
      '/assets/main.css': 'h1{color:blue}',
    });
  });
});

describe('serveStaticFile', () => {
  let clientDir: string;

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'vertz-static-'));
  });

  afterEach(() => {
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('returns null for root path', () => {
    expect(serveStaticFile(clientDir, '/')).toBeNull();
  });

  it('returns null for /index.html', () => {
    expect(serveStaticFile(clientDir, '/index.html')).toBeNull();
  });

  it('returns null for path traversal attempts', () => {
    expect(serveStaticFile(clientDir, '/../../../etc/passwd')).toBeNull();
  });

  it('returns null when file does not exist', () => {
    expect(serveStaticFile(clientDir, '/nonexistent.js')).toBeNull();
  });

  it('serves existing file with short cache for non-hashed assets', () => {
    writeFileSync(join(clientDir, 'favicon.ico'), 'icon-data');
    const response = serveStaticFile(clientDir, '/favicon.ico');
    expect(response).not.toBeNull();
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=3600');
  });

  it('serves hashed assets with immutable cache', () => {
    mkdirSync(join(clientDir, 'assets'), { recursive: true });
    writeFileSync(join(clientDir, 'assets', 'chunk-abc123.js'), 'export{}');
    const response = serveStaticFile(clientDir, '/assets/chunk-abc123.js');
    expect(response).not.toBeNull();
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });
});

describe('servePrerenderHTML', () => {
  let clientDir: string;

  beforeEach(() => {
    clientDir = mkdtempSync(join(tmpdir(), 'vertz-prerender-'));
  });

  afterEach(() => {
    rmSync(clientDir, { recursive: true, force: true });
  });

  it('returns null for path traversal attempts', () => {
    expect(servePrerenderHTML(clientDir, '/../../../etc/passwd')).toBeNull();
  });

  it('returns null when no pre-rendered file exists for route', () => {
    // Route /_shell.html resolves to <clientDir>/_shell.html/index.html which doesn't exist
    expect(servePrerenderHTML(clientDir, '/_shell.html')).toBeNull();
  });

  it('returns null when pre-rendered file does not exist', () => {
    expect(servePrerenderHTML(clientDir, '/about')).toBeNull();
  });

  it('serves pre-rendered HTML for root path', () => {
    writeFileSync(join(clientDir, 'index.html'), '<html><body>Home</body></html>');
    const response = servePrerenderHTML(clientDir, '/');
    expect(response).not.toBeNull();
    expect(response?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
  });

  it('serves pre-rendered HTML for nested route', () => {
    mkdirSync(join(clientDir, 'about'), { recursive: true });
    writeFileSync(join(clientDir, 'about', 'index.html'), '<html><body>About</body></html>');
    const response = servePrerenderHTML(clientDir, '/about');
    expect(response).not.toBeNull();
    expect(response?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
  });

  it('returns null when file has zero size', () => {
    writeFileSync(join(clientDir, 'index.html'), '');
    const response = servePrerenderHTML(clientDir, '/');
    expect(response).toBeNull();
  });
});

describe('startAction', () => {
  let pathsSpy: MockFunction<(...args: unknown[]) => unknown>;

  afterEach(() => {
    pathsSpy?.mockRestore();
  });

  it('returns err when project root is not found', async () => {
    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(undefined) as MockFunction<
      (...args: unknown[]) => unknown
    >;
    const result = await startAction({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('project root');
    }
  });

  it('returns err when app type detection fails', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vertz-start-'));
    try {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      // No entry files → detectAppType throws
      const pathsMod = await import('../../utils/paths');
      pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      const result = await startAction({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No app entry found');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns err when build outputs are missing', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vertz-start-'));
    try {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {}');
      const pathsMod = await import('../../utils/paths');
      pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      const result = await startAction({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Missing build outputs');
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('logs detected app type when verbose is true', async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'vertz-start-'));
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
      (...args: unknown[]) => unknown
    >;
    try {
      mkdirSync(join(tmpDir, 'src'), { recursive: true });
      writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {}');
      const pathsMod = await import('../../utils/paths');
      pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
        (...args: unknown[]) => unknown
      >;
      // Will fail at validateBuildOutputs but verbose log happens before that
      await startAction({ verbose: true });
      const calls = logSpy.mock.calls as unknown[][];
      const found = calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes('Detected app type:'),
      );
      expect(found).toBe(true);
    } finally {
      logSpy.mockRestore();
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('startAction — api-only', () => {
  let tmpDir: string;
  let pathsSpy: MockFunction<(...args: unknown[]) => unknown>;
  let logSpy: MockFunction<(...args: unknown[]) => unknown>;
  let processOnSpy: MockFunction<(...args: unknown[]) => unknown>;
  let originalServe: typeof Bun.serve;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vertz-start-api-'));
    originalServe = Bun.serve;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
      (...args: unknown[]) => unknown
    >;
    processOnSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process) as unknown as MockFunction<
      (...args: unknown[]) => unknown
    >;
  });

  afterEach(() => {
    pathsSpy?.mockRestore();
    logSpy.mockRestore();
    processOnSpy.mockRestore();
    // Restore Bun.serve
    Object.defineProperty(Bun, 'serve', { value: originalServe, writable: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: scaffold a temp directory as api-only project with valid build outputs.
   * Creates src/server.ts and .vertz/build/index.js with the given module content.
   */
  function scaffoldApiProject(moduleContent: string): void {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {}');
    mkdirSync(join(tmpDir, '.vertz', 'build'), { recursive: true });
    writeFileSync(join(tmpDir, '.vertz', 'build', 'index.js'), moduleContent);
  }

  it('starts server successfully with a valid API module', async () => {
    scaffoldApiProject('export default { handler: (req) => new Response("ok") };');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockServer = { port: 3000, stop: vi.fn() };
    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue(mockServer),
      writable: true,
    });

    const result = await startAction({ port: 3000, host: '0.0.0.0' });
    expect(result.ok).toBe(true);

    // Verify Bun.serve was called
    expect(Bun.serve).toHaveBeenCalledTimes(1);

    // Verify server startup message was logged
    const calls = logSpy.mock.calls as unknown[][];
    const found = calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('Vertz API server running at'),
    );
    expect(found).toBe(true);
  });

  it('sets up graceful shutdown signal handlers', async () => {
    scaffoldApiProject('export default { handler: (req) => new Response("ok") };');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockServer = { port: 3000, stop: vi.fn() };
    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue(mockServer),
      writable: true,
    });

    await startAction({ port: 3000 });

    const onCalls = processOnSpy.mock.calls as unknown[][];
    const signals = onCalls.map((args) => args[0]);
    expect(signals).toContain('SIGINT');
    expect(signals).toContain('SIGTERM');
    expect(signals).toContain('SIGHUP');
  });

  it('returns err when API module fails to import', async () => {
    // Write a module with a syntax error
    scaffoldApiProject('this is not valid javascript }{}{');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to import API module');
    }
  });

  it('returns err when API module does not export a handler function', async () => {
    scaffoldApiProject('export default { handler: "not-a-function" };');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        'API module must export default with a .handler function',
      );
    }
  });

  it('passes handler to Bun.serve as the fetch function', async () => {
    scaffoldApiProject('export default { handler: (req) => new Response("hello") };');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockServe = vi.fn().mockReturnValue({ port: 4000, stop: vi.fn() });
    Object.defineProperty(Bun, 'serve', { value: mockServe, writable: true });

    await startAction({ port: 4000, host: '127.0.0.1' });

    const serveCall = mockServe.mock.calls[0] as [
      { port: number; hostname: string; fetch: unknown },
    ];
    expect(serveCall[0].port).toBe(4000);
    expect(serveCall[0].hostname).toBe('127.0.0.1');
    expect(typeof serveCall[0].fetch).toBe('function');
  });

  it('uses localhost in log when host is 0.0.0.0', async () => {
    scaffoldApiProject('export default { handler: (req) => new Response("ok") };');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue({ port: 3000, stop: vi.fn() }),
      writable: true,
    });

    await startAction({ port: 3000, host: '0.0.0.0' });

    const calls = logSpy.mock.calls as unknown[][];
    const found = calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('localhost'),
    );
    expect(found).toBe(true);
  });
});

describe('startAction — ui-only', () => {
  let tmpDir: string;
  let pathsSpy: MockFunction<(...args: unknown[]) => unknown>;
  let logSpy: MockFunction<(...args: unknown[]) => unknown>;
  let processOnSpy: MockFunction<(...args: unknown[]) => unknown>;
  let originalServe: typeof Bun.serve;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vertz-start-ui-'));
    originalServe = Bun.serve;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
      (...args: unknown[]) => unknown
    >;
    processOnSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process) as unknown as MockFunction<
      (...args: unknown[]) => unknown
    >;
  });

  afterEach(() => {
    pathsSpy?.mockRestore();
    logSpy.mockRestore();
    processOnSpy.mockRestore();
    Object.defineProperty(Bun, 'serve', { value: originalServe, writable: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: scaffold a temp directory as ui-only project with valid build outputs.
   * Creates src/app.tsx, dist/client/index.html, and dist/server/app.js.
   */
  function scaffoldUIProject(ssrModuleContent: string): void {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    mkdirSync(join(tmpDir, 'dist', 'client'), { recursive: true });
    mkdirSync(join(tmpDir, 'dist', 'server'), { recursive: true });
    writeFileSync(
      join(tmpDir, 'dist', 'client', 'index.html'),
      '<html><body><!--ssr--></body></html>',
    );
    writeFileSync(join(tmpDir, 'dist', 'server', 'app.js'), ssrModuleContent);
  }

  it('starts server successfully with valid SSR module', async () => {
    scaffoldUIProject('export default {};');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockServer = { port: 3000, stop: vi.fn() };
    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue(mockServer),
      writable: true,
    });

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(true);
    expect(Bun.serve).toHaveBeenCalledTimes(1);

    // Verify server startup message
    const calls = logSpy.mock.calls as unknown[][];
    const found = calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('Vertz server running at'),
    );
    expect(found).toBe(true);
  });

  it('prefers _shell.html template over index.html', async () => {
    scaffoldUIProject('export default {};');
    // Also write _shell.html
    writeFileSync(
      join(tmpDir, 'dist', 'client', '_shell.html'),
      '<html><body><!--shell--></body></html>',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockServer = { port: 3000, stop: vi.fn() };
    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue(mockServer),
      writable: true,
    });

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(true);
  });

  it('returns err when SSR module fails to import', async () => {
    scaffoldUIProject('this is not valid javascript }{}{');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to import SSR module');
    }
  });

  it('sets up graceful shutdown for UI server', async () => {
    scaffoldUIProject('export default {};');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue({ port: 3000, stop: vi.fn() }),
      writable: true,
    });

    await startAction({ port: 3000 });

    const onCalls = processOnSpy.mock.calls as unknown[][];
    const signals = onCalls.map((args) => args[0]);
    expect(signals).toContain('SIGINT');
    expect(signals).toContain('SIGTERM');
  });

  it('fetch handler serves SSR for nav pre-fetch requests', async () => {
    scaffoldUIProject('export default {};');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    let capturedFetch: ((req: Request) => Response | Promise<Response>) | undefined;
    const mockServe = vi
      .fn()
      .mockImplementation((opts: { fetch: (req: Request) => Response | Promise<Response> }) => {
        capturedFetch = opts.fetch;
        return { port: 3000, stop: vi.fn() };
      });
    Object.defineProperty(Bun, 'serve', { value: mockServe, writable: true });

    await startAction({ port: 3000 });

    expect(capturedFetch).toBeDefined();
    // Nav pre-fetch request — goes through SSR handler which returns a Response
    const navReq = new Request('http://localhost:3000/', {
      headers: { 'x-vertz-nav': '1' },
    });
    const response = await capturedFetch?.(navReq);
    expect(response).toBeInstanceOf(Response);
  });

  it('fetch handler serves static files and falls back to SSR', async () => {
    scaffoldUIProject('export default {};');
    // Create a static file
    mkdirSync(join(tmpDir, 'dist', 'client', 'assets'), { recursive: true });
    writeFileSync(join(tmpDir, 'dist', 'client', 'assets', 'app.js'), 'console.log("hello")');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    let capturedFetch: ((req: Request) => Response | Promise<Response>) | undefined;
    const mockServe = vi
      .fn()
      .mockImplementation((opts: { fetch: (req: Request) => Response | Promise<Response> }) => {
        capturedFetch = opts.fetch;
        return { port: 3000, stop: vi.fn() };
      });
    Object.defineProperty(Bun, 'serve', { value: mockServe, writable: true });

    await startAction({ port: 3000 });

    // Request a static asset
    const staticReq = new Request('http://localhost:3000/assets/app.js');
    const staticRes = await capturedFetch?.(staticReq);
    expect(staticRes).toBeDefined();
    expect(staticRes!.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    // Request a route — falls through to SSR
    const routeReq = new Request('http://localhost:3000/about');
    const routeRes = await capturedFetch?.(routeReq);
    expect(routeRes).toBeDefined();
    expect(routeRes).toBeInstanceOf(Response);
  });
});

describe('startAction — full-stack', () => {
  let tmpDir: string;
  let pathsSpy: MockFunction<(...args: unknown[]) => unknown>;
  let logSpy: MockFunction<(...args: unknown[]) => unknown>;
  let processOnSpy: MockFunction<(...args: unknown[]) => unknown>;
  let originalServe: typeof Bun.serve;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'vertz-start-fs-'));
    originalServe = Bun.serve;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {}) as MockFunction<
      (...args: unknown[]) => unknown
    >;
    processOnSpy = vi
      .spyOn(process, 'on')
      .mockImplementation(() => process) as unknown as MockFunction<
      (...args: unknown[]) => unknown
    >;
  });

  afterEach(() => {
    pathsSpy?.mockRestore();
    logSpy.mockRestore();
    processOnSpy.mockRestore();
    Object.defineProperty(Bun, 'serve', { value: originalServe, writable: true });
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper: scaffold a temp directory as full-stack project with valid build outputs.
   */
  function scaffoldFullStackProject(apiModuleContent: string, ssrModuleContent: string): void {
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'server.ts'), 'export default {}');
    writeFileSync(join(tmpDir, 'src', 'app.tsx'), 'export default function App() {}');
    mkdirSync(join(tmpDir, '.vertz', 'build'), { recursive: true });
    writeFileSync(join(tmpDir, '.vertz', 'build', 'index.js'), apiModuleContent);
    mkdirSync(join(tmpDir, 'dist', 'client'), { recursive: true });
    mkdirSync(join(tmpDir, 'dist', 'server'), { recursive: true });
    writeFileSync(join(tmpDir, 'dist', 'client', 'index.html'), '<html><body></body></html>');
    writeFileSync(join(tmpDir, 'dist', 'server', 'app.js'), ssrModuleContent);
  }

  it('starts server successfully with valid API + SSR modules', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockServer = { port: 3000, stop: vi.fn() };
    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue(mockServer),
      writable: true,
    });

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(true);
    expect(Bun.serve).toHaveBeenCalledTimes(1);

    // Verify full-stack server startup message
    const calls = logSpy.mock.calls as unknown[][];
    const found = calls.some(
      (args) =>
        typeof args[0] === 'string' && args[0].includes('Vertz full-stack server running at'),
    );
    expect(found).toBe(true);
  });

  it('returns err when API module fails to import', async () => {
    scaffoldFullStackProject('this is not valid javascript }{}{', 'export default {};');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to import API module');
    }
  });

  it('returns err when API module has no handler function', async () => {
    scaffoldFullStackProject('export default { handler: 42 };', 'export default {};');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain(
        'API module must export default with a .handler function',
      );
    }
  });

  it('returns err when SSR module fails to import', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'this is not valid javascript }{}{',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('Failed to import SSR module');
    }
  });

  it('sets up graceful shutdown for full-stack server', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue({ port: 3000, stop: vi.fn() }),
      writable: true,
    });

    await startAction({ port: 3000 });

    const onCalls = processOnSpy.mock.calls as unknown[][];
    const signals = onCalls.map((args) => args[0]);
    expect(signals).toContain('SIGINT');
    expect(signals).toContain('SIGTERM');
    expect(signals).toContain('SIGHUP');
  });

  it('prefers _shell.html over index.html for template', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );
    writeFileSync(
      join(tmpDir, 'dist', 'client', '_shell.html'),
      '<html><body><!--shell--></body></html>',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue({ port: 3000, stop: vi.fn() }),
      writable: true,
    });

    const result = await startAction({ port: 3000 });
    expect(result.ok).toBe(true);
  });

  it('uses custom host in log when not 0.0.0.0', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue({ port: 8080, stop: vi.fn() }),
      writable: true,
    });

    await startAction({ port: 8080, host: '192.168.1.1' });

    const calls = logSpy.mock.calls as unknown[][];
    const found = calls.some(
      (args) => typeof args[0] === 'string' && args[0].includes('192.168.1.1'),
    );
    expect(found).toBe(true);
  });

  it('fetch handler routes /api paths to API handler', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api-response") };',
      'export default {};',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    let capturedFetch: ((req: Request) => Response | Promise<Response>) | undefined;
    const mockServe = vi
      .fn()
      .mockImplementation((opts: { fetch: (req: Request) => Response | Promise<Response> }) => {
        capturedFetch = opts.fetch;
        return { port: 3000, stop: vi.fn() };
      });
    Object.defineProperty(Bun, 'serve', { value: mockServe, writable: true });

    await startAction({ port: 3000 });

    expect(capturedFetch).toBeDefined();

    // API request
    const apiReq = new Request('http://localhost:3000/api/users');
    const apiRes = await capturedFetch?.(apiReq);
    expect(apiRes).toBeDefined();
    const body = await apiRes!.text();
    expect(body).toBe('api-response');
  });

  it('fetch handler routes nav pre-fetch to SSR handler', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    let capturedFetch: ((req: Request) => Response | Promise<Response>) | undefined;
    const mockServe = vi
      .fn()
      .mockImplementation((opts: { fetch: (req: Request) => Response | Promise<Response> }) => {
        capturedFetch = opts.fetch;
        return { port: 3000, stop: vi.fn() };
      });
    Object.defineProperty(Bun, 'serve', { value: mockServe, writable: true });

    await startAction({ port: 3000 });

    const navReq = new Request('http://localhost:3000/', {
      headers: { 'x-vertz-nav': '1' },
    });
    const response = await capturedFetch?.(navReq);
    expect(response).toBeInstanceOf(Response);
  });

  it('fetch handler serves static files and falls back to SSR', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );
    mkdirSync(join(tmpDir, 'dist', 'client', 'assets'), { recursive: true });
    writeFileSync(join(tmpDir, 'dist', 'client', 'assets', 'style.css'), 'body{}');

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    let capturedFetch: ((req: Request) => Response | Promise<Response>) | undefined;
    const mockServe = vi
      .fn()
      .mockImplementation((opts: { fetch: (req: Request) => Response | Promise<Response> }) => {
        capturedFetch = opts.fetch;
        return { port: 3000, stop: vi.fn() };
      });
    Object.defineProperty(Bun, 'serve', { value: mockServe, writable: true });

    await startAction({ port: 3000 });

    // Static asset
    const staticReq = new Request('http://localhost:3000/assets/style.css');
    const staticRes = await capturedFetch?.(staticReq);
    expect(staticRes).toBeDefined();
    expect(staticRes!.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');

    // Non-API, non-static route falls to SSR
    const routeReq = new Request('http://localhost:3000/dashboard');
    const routeRes = await capturedFetch?.(routeReq);
    expect(routeRes).toBeDefined();
    expect(routeRes).toBeInstanceOf(Response);
  });

  it('graceful shutdown callback stops server and exits', async () => {
    scaffoldFullStackProject(
      'export default { handler: (req) => new Response("api") };',
      'export default {};',
    );

    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    const mockStop = vi.fn();
    Object.defineProperty(Bun, 'serve', {
      value: vi.fn().mockReturnValue({ port: 3000, stop: mockStop }),
      writable: true,
    });

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never) as MockFunction<
      (...args: unknown[]) => unknown
    >;

    await startAction({ port: 3000 });

    // Find the SIGINT handler from process.on calls
    const onCalls = processOnSpy.mock.calls as [string, () => void][];
    const sigintHandler = onCalls.find(([signal]) => signal === 'SIGINT');
    expect(sigintHandler).toBeDefined();

    // Call the shutdown handler
    sigintHandler?.[1]();

    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});
