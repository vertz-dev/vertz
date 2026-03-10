/**
 * Tests for the bun-plugin onLoad handler.
 *
 * Captures the onLoad handler registered by createVertzBunPlugin()
 * and invokes it directly with temp files to exercise code paths
 * not covered by manifest HMR tests.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVertzBunPlugin } from '../bun-plugin/plugin';
import type { DebugLogger } from '../debug-logger';
import { DiagnosticsCollector } from '../diagnostics-collector';

// ── Helpers ──────────────────────────────────────────────────────

function createMockLogger(
  enabledCategories: Set<string> = new Set(['plugin', 'fields', 'manifest']),
): DebugLogger & {
  entries: { category: string; message: string; data?: Record<string, unknown> }[];
} {
  const entries: { category: string; message: string; data?: Record<string, unknown> }[] = [];
  return {
    entries,
    log(category, message, data) {
      entries.push({ category, message, data });
    },
    isEnabled(category) {
      return enabledCategories.has(category);
    },
  };
}

function createTempProject(): {
  dir: string;
  srcDir: string;
  cssDir: string;
  write: (path: string, content: string) => string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'vertz-plugin-onload-'));
  const srcDir = join(dir, 'src');
  const cssDir = join(dir, '.vertz', 'css');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(cssDir, { recursive: true });

  return {
    dir,
    srcDir,
    cssDir,
    write(relativePath: string, content: string): string {
      const fullPath = join(srcDir, relativePath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
      return fullPath;
    },
  };
}

/**
 * Capture the onLoad handler from a BunPlugin and invoke it with a file path.
 */
async function runPluginOnLoad(
  plugin: { name: string; setup: (build: any) => void },
  filePath: string,
): Promise<{ contents: string; loader: string }> {
  let handler: ((args: { path: string }) => Promise<any>) | null = null;

  plugin.setup({
    onLoad(_opts: any, cb: any) {
      handler = cb;
    },
  });

  if (!handler) throw new Error('Plugin did not register an onLoad handler');
  const onLoad = handler as (args: { path: string }) => Promise<any>;
  return onLoad({ path: filePath });
}

// ── Tests ────────────────────────────────────────────────────────

describe('bun-plugin onLoad handler', () => {
  let project: ReturnType<typeof createTempProject>;

  beforeEach(() => {
    project = createTempProject();
  });

  afterEach(() => {
    rmSync(project.dir, { recursive: true, force: true });
  });

  describe('field selection debug logging', () => {
    it('logs field selection diagnostics when logger fields category is enabled', async () => {
      const logger = createMockLogger(new Set(['fields']));

      const filePath = project.write(
        'user-list.tsx',
        `
import { query } from '@vertz/ui';

const api = { users: { list: () => ({}) } };

export function UserList() {
  const users = query(api.users.list());
  return <div>{users.data.name}</div>;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        logger,
      });

      await runPluginOnLoad(plugin, filePath);

      const fieldEntries = logger.entries.filter((e) => e.category === 'fields');
      expect(fieldEntries.length).toBeGreaterThan(0);
      expect(fieldEntries[0]?.message).toBe('query');
      expect(fieldEntries[0]?.data?.queryVar).toBe('users');
    });
  });

  describe('field selection diagnostics recording', () => {
    it('records field selection diagnostics in DiagnosticsCollector', async () => {
      const diagnostics = new DiagnosticsCollector();

      const filePath = project.write(
        'task-list.tsx',
        `
import { query } from '@vertz/ui';

const api = { tasks: { list: () => ({}) } };

export function TaskList() {
  const tasks = query(api.tasks.list());
  return <div>{tasks.data.title}</div>;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        diagnostics,
      });

      await runPluginOnLoad(plugin, filePath);

      const snapshot = diagnostics.getSnapshot();
      const entries = Object.values(snapshot.fieldSelection.entries);
      expect(entries.length).toBeGreaterThan(0);
      const entry = entries[0]!;
      expect(entry.queries.length).toBeGreaterThan(0);
      expect(entry.queries[0]?.queryVar).toBe('tasks');
    });
  });

  describe('CSS sidecar with HMR', () => {
    it('writes CSS sidecar file and adds CSS import when hmr is enabled', async () => {
      const filePath = project.write(
        'styled.tsx',
        `
const styles = css({
  root: ['p:4'],
});

export function Styled() {
  return <div class={styles.root}>Hello</div>;
}
`,
      );

      const { plugin, cssSidecarMap, fileExtractions } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: true,
        fastRefresh: false,
      });

      const result = await runPluginOnLoad(plugin, filePath);

      // CSS sidecar file should have been written
      expect(cssSidecarMap.size).toBe(1);
      const cssFilePath = cssSidecarMap.get(filePath)!;
      expect(existsSync(cssFilePath)).toBe(true);

      // File extractions should be recorded
      expect(fileExtractions.size).toBe(1);

      // Output should contain the CSS import line
      expect(result.contents).toContain("import '");
      expect(result.contents).toContain('.css');
    });
  });

  describe('plugin done logging', () => {
    it('logs done event with duration and stages when plugin logger is enabled', async () => {
      const logger = createMockLogger(new Set(['plugin']));

      const filePath = project.write(
        'simple.tsx',
        `
export function Simple() {
  return <div>Hello</div>;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        logger,
      });

      await runPluginOnLoad(plugin, filePath);

      const doneEntries = logger.entries.filter(
        (e) => e.category === 'plugin' && e.message === 'done',
      );
      expect(doneEntries.length).toBe(1);
      expect(doneEntries[0]?.data).toBeDefined();
      expect(typeof doneEntries[0]?.data?.durationMs).toBe('number');
      expect(typeof doneEntries[0]?.data?.stages).toBe('string');
      expect(doneEntries[0]?.data?.stages as string).toContain('hydration');
      expect(doneEntries[0]?.data?.stages as string).toContain('compile');
      expect(doneEntries[0]?.data?.stages as string).toContain('sourceMap');
    });

    it('includes css and hmr in stages when CSS is present and hmr enabled', async () => {
      const logger = createMockLogger(new Set(['plugin']));

      const filePath = project.write(
        'with-css.tsx',
        `
const styles = css({
  root: ['p:4'],
});

export function WithCSS() {
  return <div class={styles.root}>Hello</div>;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: true,
        fastRefresh: false,
        logger,
      });

      await runPluginOnLoad(plugin, filePath);

      const doneEntries = logger.entries.filter(
        (e) => e.category === 'plugin' && e.message === 'done',
      );
      expect(doneEntries.length).toBe(1);
      const stages = doneEntries[0]?.data?.stages as string;
      expect(stages).toContain('css');
      expect(stages).toContain('hmr');
    });

    it('includes fastRefresh and stableIds in stages when fastRefresh enabled', async () => {
      const logger = createMockLogger(new Set(['plugin']));

      const filePath = project.write(
        'refreshable.tsx',
        `
export function Refreshable() {
  return <div>Hello</div>;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: true,
        fastRefresh: true,
        logger,
      });

      await runPluginOnLoad(plugin, filePath);

      const doneEntries = logger.entries.filter(
        (e) => e.category === 'plugin' && e.message === 'done',
      );
      expect(doneEntries.length).toBe(1);
      const stages = doneEntries[0]?.data?.stages as string;
      expect(stages).toContain('stableIds');
    });
  });

  describe('error handling', () => {
    it('catches onLoad errors and logs them with relative path', async () => {
      // Write a file that will cause a compile error
      // We'll write an empty file — the compilation pipeline itself shouldn't crash,
      // but let's write something that breaks MagicString or the AST parse
      const filePath = project.write('broken.tsx', '');
      // Overwrite the file with null bytes to break Bun.file().text() or MagicString
      writeFileSync(filePath, '');

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
      });

      // Empty files may not crash — we need to test with a non-existent file
      // to trigger the error catch block
      const consoleSpy = mock(() => {});
      const originalError = console.error;
      console.error = consoleSpy;

      try {
        // Use a file path that doesn't exist on disk — Bun.file().text() will reject
        await runPluginOnLoad(plugin, join(project.srcDir, 'nonexistent.tsx'));
        // If we get here, the error was swallowed — unexpected
        expect(true).toBe(false);
      } catch (_err) {
        // The plugin should have logged to console.error and re-thrown
        expect(consoleSpy).toHaveBeenCalled();
        const loggedArgs = consoleSpy.mock.calls[0]!;
        expect(loggedArgs[0]).toContain('[vertz-bun-plugin]');
        expect(loggedArgs[0]).toContain('nonexistent.tsx');
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('cross-file field selection (resolveImport callback)', () => {
    it('resolves cross-file fields via fieldSelectionResolveImport', async () => {
      // Child component in a separate file
      project.write(
        'components/user-card.tsx',
        `
export function UserCard({ user }: { user: any }) {
  return <div>{user.name}<span>{user.email}</span></div>;
}
`,
      );

      // Parent component that imports UserCard and passes query data to it
      const parentPath = project.write(
        'pages/user-list.tsx',
        `
import { query } from '@vertz/ui';
import { UserCard } from '../components/user-card';

const api = { users: { list: () => ({}) } };

export function UserList() {
  const users = query(api.users.list());
  return <div>{users.data.items.map((u: any) => <UserCard user={u} />)}</div>;
}
`,
      );

      const diagnostics = new DiagnosticsCollector();

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        diagnostics,
      });

      await runPluginOnLoad(plugin, parentPath);

      // The field selection should have resolved cross-file fields
      const snapshot = diagnostics.getSnapshot();
      const entries = Object.values(snapshot.fieldSelection.entries);
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('CSS import line in output assembly', () => {
    it('prepends CSS import line when CSS extraction has content and hmr is on', async () => {
      const filePath = project.write(
        'css-component.tsx',
        `
const styles = css({
  wrapper: ['m:2'],
});

export function CSSComponent() {
  return <div class={styles.wrapper}>Styled</div>;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: true,
        fastRefresh: false,
      });

      const result = await runPluginOnLoad(plugin, filePath);

      // The output should start with the CSS import
      expect(result.contents.trimStart().startsWith("import '")).toBe(true);
    });
  });
});
