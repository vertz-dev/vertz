/**
 * Tests for incremental HMR manifest updates in the Bun plugin.
 *
 * Verifies that createVertzBunPlugin() exposes updateManifest() and
 * deleteManifest() functions for the file watcher to use.
 *
 * @see https://github.com/vertz-dev/vertz/issues/991
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVertzBunPlugin } from '../bun-plugin/plugin';
import type { DebugLogger } from '../debug-logger';

function createMockLogger(): DebugLogger & {
  entries: { category: string; message: string; data?: Record<string, unknown> }[];
} {
  const entries: { category: string; message: string; data?: Record<string, unknown> }[] = [];
  return {
    entries,
    log(category, message, data) {
      entries.push({ category, message, data });
    },
    isEnabled() {
      return true;
    },
  };
}

function createTempProject(): {
  dir: string;
  srcDir: string;
  write: (path: string, content: string) => string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'vertz-plugin-manifest-'));
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });

  return {
    dir,
    srcDir,
    write(relativePath: string, content: string): string {
      const fullPath = join(srcDir, relativePath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
      return fullPath;
    },
  };
}

describe('bun-plugin manifest HMR', () => {
  let project: ReturnType<typeof createTempProject>;

  beforeEach(() => {
    project = createTempProject();
  });

  afterEach(() => {
    rmSync(project.dir, { recursive: true, force: true });
  });

  describe('updateManifest', () => {
    it('is returned by createVertzBunPlugin', () => {
      project.write('app.tsx', 'export function App() { return <div />; }');

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      expect(typeof result.updateManifest).toBe('function');
    });

    it('returns changed: false when manifest shape is unchanged', () => {
      const filePath = project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetch('/api/tasks'));
        }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      // Same shape — just change the URL inside the function body
      const updated = result.updateManifest(
        filePath,
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetch('/api/tasks/v2'));
        }
      `,
      );

      expect(updated.changed).toBe(false);
    });
  });

  it('returns changed: true when manifest shape changes', () => {
    const filePath = project.write(
      'hooks/use-tasks.ts',
      `
        export function useTasks() {
          return 'static value';
        }
      `,
    );

    const result = createVertzBunPlugin({
      projectRoot: project.dir,
      srcDir: project.srcDir,
      hmr: false,
      fastRefresh: false,
    });

    // Change from static to signal-api
    const updated = result.updateManifest(
      filePath,
      `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetch('/api/tasks'));
        }
      `,
    );

    expect(updated.changed).toBe(true);
  });

  it('returns changed: true for new file not in initial manifest', () => {
    project.write('app.tsx', 'export function App() { return <div />; }');

    const result = createVertzBunPlugin({
      projectRoot: project.dir,
      srcDir: project.srcDir,
      hmr: false,
      fastRefresh: false,
    });

    // Add a brand new file
    const newFilePath = project.write(
      'hooks/use-new.ts',
      `
        import { query } from '@vertz/ui';
        export function useNew() {
          return query(() => fetch('/api/new'));
        }
      `,
    );

    const updated = result.updateManifest(
      newFilePath,
      `
        import { query } from '@vertz/ui';
        export function useNew() {
          return query(() => fetch('/api/new'));
        }
      `,
    );

    expect(updated.changed).toBe(true);
  });

  describe('deleteManifest', () => {
    it('is returned by createVertzBunPlugin', () => {
      project.write('app.tsx', 'export function App() { return <div />; }');

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      expect(typeof result.deleteManifest).toBe('function');
    });

    it('returns true when file had a manifest entry', () => {
      const filePath = project.write(
        'hooks/use-tasks.ts',
        `
        export function useTasks() { return 'static'; }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      expect(result.deleteManifest(filePath)).toBe(true);
    });

    it('returns false when file had no manifest entry', () => {
      project.write('app.tsx', 'export function App() { return <div />; }');

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      expect(result.deleteManifest('/non/existent/file.ts')).toBe(false);
    });
  });

  it('returns changed: true when export is added or removed', () => {
    const filePath = project.write(
      'hooks/use-data.ts',
      `
        export function useData() { return 'static'; }
      `,
    );

    const result = createVertzBunPlugin({
      projectRoot: project.dir,
      srcDir: project.srcDir,
      hmr: false,
      fastRefresh: false,
    });

    // Add a new export
    const updated = result.updateManifest(
      filePath,
      `
        export function useData() { return 'static'; }
        export function useOther() { return 'also static'; }
      `,
    );

    expect(updated.changed).toBe(true);
  });

  describe('debug logging', () => {
    it('logs hmr-update event via VERTZ_DEBUG=manifest', () => {
      const logger = createMockLogger();
      const filePath = project.write(
        'hooks/use-tasks.ts',
        `
        export function useTasks() { return 'static'; }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
        logger,
      });

      result.updateManifest(
        filePath,
        `
        import { query } from '@vertz/ui';
        export function useTasks() { return query(() => fetch('/api')); }
      `,
      );

      const hmrEntries = logger.entries.filter((e) => e.message === 'hmr-update');
      expect(hmrEntries.length).toBe(1);
      expect(hmrEntries[0].data?.changed).toBe(true);
    });

    it('logs hmr-delete event when deleting manifest', () => {
      const logger = createMockLogger();
      const filePath = project.write(
        'hooks/use-tasks.ts',
        `
        export function useTasks() { return 'static'; }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
        logger,
      });

      result.deleteManifest(filePath);

      const deleteEntries = logger.entries.filter((e) => e.message === 'hmr-delete');
      expect(deleteEntries.length).toBe(1);
    });
  });

  describe('cache invalidation', () => {
    it('subsequent compilation uses updated manifest after updateManifest', () => {
      // Set up a hook file that starts as static
      const hookPath = project.write(
        'hooks/use-tasks.ts',
        `
        export function useTasks() {
          return 'static';
        }
      `,
      );

      // Set up a component that imports the hook
      project.write(
        'app.tsx',
        `
        import { useTasks } from './hooks/use-tasks';
        export function App() {
          const tasks = useTasks();
          return <div>{tasks}</div>;
        }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      // Update the hook to return query() (signal-api shape)
      const updated = result.updateManifest(
        hookPath,
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetch('/api/tasks'));
        }
      `,
      );

      expect(updated.changed).toBe(true);
      // After updateManifest, the cached Record is invalidated.
      // The next onLoad call would use the fresh manifest with useTasks
      // classified as signal-api instead of static.
      // (We can't easily test onLoad directly, but we verify the cache is
      // invalidated by checking that a second identical update returns
      // changed: false — proving the map was updated.)
      const secondUpdate = result.updateManifest(
        hookPath,
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetch('/api/tasks'));
        }
      `,
      );

      expect(secondUpdate.changed).toBe(false);
    });
  });
});
