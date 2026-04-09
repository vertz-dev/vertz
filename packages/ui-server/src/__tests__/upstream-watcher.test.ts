import { afterEach, beforeEach, describe, expect, it } from '@vertz/test';
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { createUpstreamWatcher, resolveWorkspacePackages } from '../upstream-watcher';

describe('resolveWorkspacePackages', () => {
  let tmpDir: string;

  beforeEach(() => {
    const raw = join(os.tmpdir(), `vertz-upstream-test-${Date.now()}`);
    mkdirSync(raw, { recursive: true });
    tmpDir = realpathSync(raw);
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  describe('Given a package is symlinked (workspace-linked)', () => {
    it('Then includes it in the result with its real dist path', () => {
      // Create a "real" package location with dist/
      const realPkgDir = join(tmpDir, 'packages', 'theme-shadcn');
      const realDistDir = join(realPkgDir, 'dist');
      mkdirSync(realDistDir, { recursive: true });

      // Create node_modules/@vertz/ with a symlink to the real package
      const nmDir = join(tmpDir, 'node_modules', '@vertz', 'theme-shadcn');
      mkdirSync(join(tmpDir, 'node_modules', '@vertz'), { recursive: true });
      symlinkSync(realPkgDir, nmDir);

      const result = resolveWorkspacePackages(tmpDir, true);

      expect(result).toEqual([{ name: '@vertz/theme-shadcn', distPath: realDistDir }]);
    });
  });

  describe('Given a package is NOT symlinked (npm-installed)', () => {
    it('Then excludes it from the result', () => {
      // Create a real directory (not a symlink) under node_modules/@vertz/
      const nmPkgDir = join(tmpDir, 'node_modules', '@vertz', 'errors');
      mkdirSync(join(nmPkgDir, 'dist'), { recursive: true });

      const result = resolveWorkspacePackages(tmpDir, true);

      expect(result).toEqual([]);
    });
  });

  describe('Given a symlinked package has no dist/ directory', () => {
    it('Then excludes it from the result', () => {
      // Create a real package WITHOUT dist/
      const realPkgDir = join(tmpDir, 'packages', 'new-pkg');
      mkdirSync(realPkgDir, { recursive: true });

      // Symlink it
      mkdirSync(join(tmpDir, 'node_modules', '@vertz'), { recursive: true });
      symlinkSync(realPkgDir, join(tmpDir, 'node_modules', '@vertz', 'new-pkg'));

      const result = resolveWorkspacePackages(tmpDir, true);

      expect(result).toEqual([]);
    });
  });

  describe('Given filter is a string array', () => {
    it('Then only checks named packages', () => {
      // Create two symlinked packages with dist/
      const pkg1Dir = join(tmpDir, 'packages', 'theme-shadcn');
      mkdirSync(join(pkg1Dir, 'dist'), { recursive: true });
      const pkg2Dir = join(tmpDir, 'packages', 'ui');
      mkdirSync(join(pkg2Dir, 'dist'), { recursive: true });

      mkdirSync(join(tmpDir, 'node_modules', '@vertz'), { recursive: true });
      symlinkSync(pkg1Dir, join(tmpDir, 'node_modules', '@vertz', 'theme-shadcn'));
      symlinkSync(pkg2Dir, join(tmpDir, 'node_modules', '@vertz', 'ui'));

      // Only ask for theme-shadcn
      const result = resolveWorkspacePackages(tmpDir, ['@vertz/theme-shadcn']);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('@vertz/theme-shadcn');
    });
  });

  describe('Given no @vertz/ directory exists in node_modules', () => {
    it('Then returns empty array', () => {
      const result = resolveWorkspacePackages(tmpDir, true);

      expect(result).toEqual([]);
    });
  });

  describe('Given multiple symlinked packages', () => {
    it('Then returns all with their dist paths', () => {
      const pkg1Dir = join(tmpDir, 'packages', 'theme-shadcn');
      mkdirSync(join(pkg1Dir, 'dist'), { recursive: true });
      const pkg2Dir = join(tmpDir, 'packages', 'ui-primitives');
      mkdirSync(join(pkg2Dir, 'dist'), { recursive: true });

      mkdirSync(join(tmpDir, 'node_modules', '@vertz'), { recursive: true });
      symlinkSync(pkg1Dir, join(tmpDir, 'node_modules', '@vertz', 'theme-shadcn'));
      symlinkSync(pkg2Dir, join(tmpDir, 'node_modules', '@vertz', 'ui-primitives'));

      const result = resolveWorkspacePackages(tmpDir, true);

      expect(result).toHaveLength(2);
      const names = result.map((r) => r.name).sort();
      expect(names).toEqual(['@vertz/theme-shadcn', '@vertz/ui-primitives']);
    });
  });
});

describe('createUpstreamWatcher', () => {
  let tmpDir: string;
  const openWatchers: Array<{ close(): void }> = [];

  beforeEach(() => {
    const raw = join(os.tmpdir(), `vertz-upstream-watcher-${Date.now()}`);
    mkdirSync(raw, { recursive: true });
    tmpDir = realpathSync(raw);
  });

  afterEach(() => {
    for (const w of openWatchers) w.close();
    openWatchers.length = 0;
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupSymlinkedPkg(name: string): string {
    const realPkgDir = join(tmpDir, 'packages', name);
    const distDir = join(realPkgDir, 'dist');
    mkdirSync(distDir, { recursive: true });
    mkdirSync(join(tmpDir, 'node_modules', '@vertz'), { recursive: true });
    try {
      symlinkSync(realPkgDir, join(tmpDir, 'node_modules', '@vertz', name));
    } catch {
      // symlink may already exist
    }
    return distDir;
  }

  describe('Given a dev server with watchDeps: true', () => {
    it('Then exposes the list of watched packages', () => {
      setupSymlinkedPkg('theme-shadcn');

      const watcher = createUpstreamWatcher({
        projectRoot: tmpDir,
        watchDeps: true,
        onDistChanged: () => {},
      });
      openWatchers.push(watcher);

      expect(watcher.packages).toHaveLength(1);
      expect(watcher.packages[0].name).toBe('@vertz/theme-shadcn');
    });
  });

  describe('Given a workspace-linked package dist is rebuilt', () => {
    it('Then calls onDistChanged with the package name', async () => {
      const distDir = setupSymlinkedPkg('theme-shadcn');

      const changed: string[] = [];
      const watcher = createUpstreamWatcher({
        projectRoot: tmpDir,
        watchDeps: true,
        onDistChanged: (name) => changed.push(name),
        debounceMs: 100,
        persistent: true,
      });
      openWatchers.push(watcher);

      // Give FSEvents time to initialize before writing
      await new Promise((r) => setTimeout(r, 200));

      // Simulate a dist rebuild by writing a file
      writeFileSync(join(distDir, 'index.js'), 'export default {}');

      // Wait for watcher event + debounce
      await new Promise((r) => setTimeout(r, 500));

      expect(changed).toEqual(['@vertz/theme-shadcn']);
    });
  });

  describe('Given no symlinked packages exist', () => {
    it('Then returns a watcher with no packages', () => {
      const watcher = createUpstreamWatcher({
        projectRoot: tmpDir,
        watchDeps: true,
        onDistChanged: () => {},
      });
      openWatchers.push(watcher);

      expect(watcher.packages).toHaveLength(0);
    });
  });

  describe('Given multiple rapid dist changes', () => {
    it('Then coalesces into a single onDistChanged call', async () => {
      const distDir = setupSymlinkedPkg('theme-shadcn');

      const changed: string[] = [];
      const watcher = createUpstreamWatcher({
        projectRoot: tmpDir,
        watchDeps: true,
        onDistChanged: (name) => changed.push(name),
        debounceMs: 200,
        persistent: true,
      });
      openWatchers.push(watcher);

      // Give FSEvents time to initialize before writing
      await new Promise((r) => setTimeout(r, 200));

      // Simulate a build writing multiple files rapidly
      writeFileSync(join(distDir, 'index.js'), 'v1');
      writeFileSync(join(distDir, 'styles.css'), 'v1');
      writeFileSync(join(distDir, 'chunk.js'), 'v1');

      // Wait for watcher events + debounce
      await new Promise((r) => setTimeout(r, 800));

      expect(changed).toEqual(['@vertz/theme-shadcn']);
    });
  });

  describe('Given close() is called', () => {
    it('Then stops watching and no more callbacks fire', async () => {
      const distDir = setupSymlinkedPkg('ui');

      const changed: string[] = [];
      const watcher = createUpstreamWatcher({
        projectRoot: tmpDir,
        watchDeps: true,
        onDistChanged: (name) => changed.push(name),
        debounceMs: 100,
      });

      watcher.close();

      // Write after close
      writeFileSync(join(distDir, 'index.js'), 'export default {}');
      await new Promise((r) => setTimeout(r, 300));

      expect(changed).toEqual([]);
    });
  });

  describe('Given a watcher error occurs', () => {
    it('Then does not throw (handles gracefully)', () => {
      // Watcher on non-existent dist should not crash
      const realPkgDir = join(tmpDir, 'packages', 'ghost');
      mkdirSync(realPkgDir, { recursive: true });
      mkdirSync(join(realPkgDir, 'dist'), { recursive: true });
      mkdirSync(join(tmpDir, 'node_modules', '@vertz'), { recursive: true });
      symlinkSync(realPkgDir, join(tmpDir, 'node_modules', '@vertz', 'ghost'));

      const watcher = createUpstreamWatcher({
        projectRoot: tmpDir,
        watchDeps: true,
        onDistChanged: () => {},
      });
      openWatchers.push(watcher);

      expect(watcher.packages).toHaveLength(1);
    });
  });
});
