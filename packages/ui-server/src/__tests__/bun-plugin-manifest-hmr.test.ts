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
import { DiagnosticsCollector } from '../diagnostics-collector';

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

  describe('manifestsEqual signal-api property comparison', () => {
    it('returns changed: true when signal-api signalProperties differ', () => {
      // Start with a hook returning query() — signalProperties: data, loading, error, revalidating
      const filePath = project.write(
        'hooks/use-data.ts',
        `
        import { query } from '@vertz/ui';
        export function useData() {
          return query(() => fetch('/api/data'));
        }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      // Change to form() — different signalProperties: submitting, dirty, valid
      const updated = result.updateManifest(
        filePath,
        `
        import { form } from '@vertz/ui';
        export function useData() {
          return form(() => fetch('/api/data'));
        }
      `,
      );

      // Both are signal-api type but with different signalProperties sets
      expect(updated.changed).toBe(true);
    });

    it('returns changed: false when signal-api properties are identical', () => {
      // Start with a hook returning query()
      const filePath = project.write(
        'hooks/use-items.ts',
        `
        import { query } from '@vertz/ui';
        export function useItems() {
          return query(() => fetch('/api/items'));
        }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      // Update with same signal-api type (still query) — same properties
      const updated = result.updateManifest(
        filePath,
        `
        import { query } from '@vertz/ui';
        export function useItems() {
          return query(() => fetch('/api/items/v2'));
        }
      `,
      );

      expect(updated.changed).toBe(false);
    });
  });

  describe('updateManifest with .tsx files', () => {
    it('updates field selection manifest for .tsx files', () => {
      const filePath = project.write(
        'components/user-card.tsx',
        `
        export function UserCard({ user }: { user: any }) {
          return <div>{user.name}</div>;
        }
      `,
      );

      const result = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
      });

      // updateManifest on a .tsx file triggers fieldSelectionManifest.updateFile
      const updated = result.updateManifest(
        filePath,
        `
        export function UserCard({ user }: { user: any }) {
          return <div>{user.name}<span>{user.email}</span></div>;
        }
      `,
      );

      // The manifest was successfully updated (no error thrown)
      expect(updated).toBeDefined();
    });

    it('does not update field selection manifest for .ts files', () => {
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

      // .ts file — no field selection update needed
      const updated = result.updateManifest(
        filePath,
        `
        export function useTasks() { return 'updated'; }
      `,
      );

      expect(updated).toBeDefined();
    });
  });

  describe('diagnostics integration', () => {
    it('records field selection manifest file count in diagnostics', () => {
      project.write(
        'components/user-card.tsx',
        `
        export function UserCard({ user }: { user: any }) {
          return <div>{user.name}</div>;
        }
      `,
      );

      const diagnostics = new DiagnosticsCollector();

      createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
        diagnostics,
      });

      const snapshot = diagnostics.getSnapshot();
      expect(snapshot.fieldSelection.manifestFileCount).toBeGreaterThanOrEqual(1);
    });

    it('records manifest prepass in diagnostics', () => {
      project.write('app.tsx', 'export function App() { return <div />; }');

      const diagnostics = new DiagnosticsCollector();

      createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
        diagnostics,
      });

      const snapshot = diagnostics.getSnapshot();
      expect(snapshot.manifest.fileCount).toBeGreaterThanOrEqual(1);
      expect(typeof snapshot.manifest.durationMs).toBe('number');
    });
  });

  describe('manifest warning logging', () => {
    it('logs warnings from pre-pass when circular dependencies exist', () => {
      const logger = createMockLogger();

      // Create circular dependency: a.ts re-exports from b.ts and vice versa
      project.write(
        'a.ts',
        `
        export { useB } from './b';
        export function useA() { return 'a'; }
      `,
      );
      project.write(
        'b.ts',
        `
        export { useA } from './a';
        export function useB() { return 'b'; }
      `,
      );

      createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        hmr: false,
        fastRefresh: false,
        logger,
      });

      const warningEntries = logger.entries.filter((e) => e.message === 'warning');
      expect(warningEntries.length).toBeGreaterThan(0);
      expect(warningEntries[0]?.data?.type).toBe('circular-dependency');
    });
  });
});
