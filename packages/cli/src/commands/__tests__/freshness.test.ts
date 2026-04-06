/**
 * Build Freshness Detection Tests
 *
 * Uses the injectable `getFileMtimeMs` option to control mtimes deterministically.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBuildFresh } from '../freshness';

describe('isBuildFresh', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'vertz-freshness-'));
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  /** Helper: create directories and write a file. */
  function writeFile(relativePath: string, content: string): void {
    const fullPath = join(projectRoot, relativePath);
    const dir = fullPath.slice(0, fullPath.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, content);
  }

  /**
   * Create a getFileMtimeMs function that returns controlled mtimes.
   * mtimeMap: record of path substring → mtimeMs value.
   * Returns undefined for paths that don't match any pattern (simulates missing file).
   */
  function createMtimeResolver(mtimeMap: Record<string, number>) {
    return (filePath: string): number | undefined => {
      for (const [pattern, mtimeMs] of Object.entries(mtimeMap)) {
        if (filePath.includes(pattern)) {
          return mtimeMs;
        }
      }
      // File exists on disk but no override — shouldn't happen in well-written tests
      return undefined;
    };
  }

  describe('Given a ui-only app with no dist/', () => {
    it('Then returns fresh: false with "dist/ is missing"', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        // No _shell.html or index.html → marker returns undefined
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('dist/ is missing');
    });
  });

  describe('Given a ui-only app with fresh dist/', () => {
    it('Then returns fresh: true when build is newer than src/', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        '_shell.html': 2000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(true);
      expect(result.reason).toBe('dist/ is up to date');
    });
  });

  describe('Given a ui-only app with stale dist/', () => {
    it('Then returns fresh: false when src/ is newer than build', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 2000,
        'package.json': 1000,
        '_shell.html': 1000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('src/ has changes newer than build');
    });
  });

  describe('Given a ui-only app with legacy index.html marker', () => {
    it('Then uses index.html when _shell.html is missing', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/index.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        'index.html': 2000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(true);
    });
  });

  describe('Given an api-only app with no build output', () => {
    it('Then returns fresh: false', () => {
      writeFile('src/server.ts', 'export default {}');
      writeFile('package.json', '{}');

      const getMtime = createMtimeResolver({
        'src/server.ts': 1000,
        'package.json': 1000,
      });

      const result = isBuildFresh(projectRoot, 'api-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('dist/ is missing');
    });
  });

  describe('Given an api-only app with fresh build', () => {
    it('Then returns fresh: true', () => {
      writeFile('src/server.ts', 'export default {}');
      writeFile('package.json', '{}');
      writeFile('.vertz/build/index.js', 'export default {}');

      const getMtime = createMtimeResolver({
        'src/server.ts': 1000,
        'package.json': 1000,
        '.vertz/build/index.js': 2000,
      });

      const result = isBuildFresh(projectRoot, 'api-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(true);
    });
  });

  describe('Given a full-stack app', () => {
    it('Then returns fresh: true when both markers are newer than src/', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('.vertz/build/index.js', 'export default {}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        '.vertz/build/index.js': 2000,
        '_shell.html': 2000,
      });

      const result = isBuildFresh(projectRoot, 'full-stack', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(true);
    });

    it('Then returns fresh: false when only API marker is missing', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        '_shell.html': 2000,
        // No .vertz/build/index.js → API marker missing
      });

      const result = isBuildFresh(projectRoot, 'full-stack', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
    });

    it('Then uses min(api, ui) marker mtime — stale if either is old', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('.vertz/build/index.js', 'export default {}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1500,
        'package.json': 1000,
        '.vertz/build/index.js': 2000,
        '_shell.html': 1200, // Older than src → stale
      });

      const result = isBuildFresh(projectRoot, 'full-stack', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('src/ has changes newer than build');
    });
  });

  describe('Given vertz.config.ts is modified after build', () => {
    it('Then returns fresh: false', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('vertz.config.ts', 'export default {}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        '_shell.html': 2000,
        'vertz.config.ts': 3000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('src/ has changes newer than build');
    });
  });

  describe('Given package.json is modified after build', () => {
    it('Then returns fresh: false', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        '_shell.html': 2000,
        'package.json': 3000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
    });
  });

  describe('Given non-source files in src/', () => {
    it('Then ignores .DS_Store, .json, and image files', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');
      writeFile('src/.DS_Store', '');
      writeFile('src/data.json', '{}');
      writeFile('src/logo.png', 'fake-png');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        '_shell.html': 2000,
        // Non-source files would be 3000 if checked, but they shouldn't be
        '.DS_Store': 3000,
        'data.json': 3000,
        'logo.png': 3000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(true);
    });
  });

  describe('Given nested source files in subdirectories', () => {
    it('Then checks nested files too', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');
      writeFile('src/pages/home.tsx', 'export default function Home() {}');

      const getMtime = createMtimeResolver({
        'app.tsx': 1000,
        'package.json': 1000,
        '_shell.html': 2000,
        'pages/home.tsx': 3000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
    });
  });

  describe('Given no source files at all', () => {
    it('Then returns fresh: false', () => {
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        '_shell.html': 2000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(false);
      expect(result.reason).toBe('no source files found');
    });
  });

  describe('Given vertz.config.ts does not exist', () => {
    it('Then only checks src/ and package.json', () => {
      writeFile('src/app.tsx', 'export default function App() {}');
      writeFile('package.json', '{}');
      writeFile('dist/client/_shell.html', '<html></html>');

      const getMtime = createMtimeResolver({
        'src/app.tsx': 1000,
        'package.json': 1000,
        '_shell.html': 2000,
      });

      const result = isBuildFresh(projectRoot, 'ui-only', { getFileMtimeMs: getMtime });
      expect(result.fresh).toBe(true);
    });
  });
});
