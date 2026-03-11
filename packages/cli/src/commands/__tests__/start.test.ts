/**
 * Start Command Tests
 *
 * Tests for the vertz start CLI command.
 * Tests validation and discovery logic (pure functions, no Bun.serve).
 */

import type { Mock } from 'bun:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  discoverInlineCSS,
  discoverSSRModule,
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

describe('startAction', () => {
  let pathsSpy: Mock<(...args: unknown[]) => unknown>;

  afterEach(() => {
    pathsSpy?.mockRestore();
  });

  it('returns err when project root is not found', async () => {
    const pathsMod = await import('../../utils/paths');
    pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(undefined) as Mock<
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
      pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as Mock<
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
      pathsSpy = vi.spyOn(pathsMod, 'findProjectRoot').mockReturnValue(tmpDir) as Mock<
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
});
