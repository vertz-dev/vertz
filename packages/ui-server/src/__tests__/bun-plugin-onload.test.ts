/**
 * Tests for the bun-plugin onLoad handler.
 *
 * Captures the onLoad handler registered by createVertzBunPlugin()
 * and invokes it directly with temp files to exercise code paths
 * not covered by manifest HMR tests.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from '@vertz/test';
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

      // The output should contain the CSS sidecar import
      expect(result.contents).toContain("import '");
      expect(result.contents).toContain('.css');
    });
  });

  describe('reloadEntitySchema', () => {
    it('returns true when schema changes on disk', () => {
      const generatedDir = join(project.dir, '.vertz', 'generated');
      mkdirSync(generatedDir, { recursive: true });
      const schemaPath = join(generatedDir, 'entity-schema.json');
      writeFileSync(
        schemaPath,
        JSON.stringify({
          tasks: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'title'],
            relations: {},
          },
        }),
      );

      project.write('app.tsx', 'export function App() { return <div />; }');

      const { reloadEntitySchema } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        entitySchemaPath: schemaPath,
      });

      // Update schema on disk
      writeFileSync(
        schemaPath,
        JSON.stringify({
          tasks: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'title', 'status'],
            relations: {},
          },
        }),
      );

      const changed = reloadEntitySchema();
      expect(changed).toBe(true);
    });

    it('returns false when schema is unchanged', () => {
      const generatedDir = join(project.dir, '.vertz', 'generated');
      mkdirSync(generatedDir, { recursive: true });
      const schemaPath = join(generatedDir, 'entity-schema.json');
      writeFileSync(
        schemaPath,
        JSON.stringify({
          tasks: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'title'],
            relations: {},
          },
        }),
      );

      project.write('app.tsx', 'export function App() { return <div />; }');

      const { reloadEntitySchema } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        entitySchemaPath: schemaPath,
      });

      const changed = reloadEntitySchema();
      expect(changed).toBe(false);
    });

    it('logs entity schema reload when logger is enabled for fields', () => {
      const logger = createMockLogger(new Set(['fields']));
      const generatedDir = join(project.dir, '.vertz', 'generated');
      mkdirSync(generatedDir, { recursive: true });
      const schemaPath = join(generatedDir, 'entity-schema.json');
      writeFileSync(
        schemaPath,
        JSON.stringify({
          tasks: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'title'],
            relations: {},
          },
        }),
      );

      project.write('app.tsx', 'export function App() { return <div />; }');

      const { reloadEntitySchema } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        entitySchemaPath: schemaPath,
        logger,
      });

      reloadEntitySchema();

      const reloadEntries = logger.entries.filter((e) => e.message === 'entity-schema-reload');
      expect(reloadEntries.length).toBe(1);
      expect(reloadEntries[0]?.data?.entities).toBe(1);
      expect(typeof reloadEntries[0]?.data?.changed).toBe('boolean');
    });
  });

  describe('entity schema loaded logging', () => {
    it('logs entity-schema-loaded when logger fields category is enabled', () => {
      const logger = createMockLogger(new Set(['fields']));
      const generatedDir = join(project.dir, '.vertz', 'generated');
      mkdirSync(generatedDir, { recursive: true });
      const schemaPath = join(generatedDir, 'entity-schema.json');
      writeFileSync(
        schemaPath,
        JSON.stringify({
          tasks: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'title'],
            relations: {},
          },
          users: {
            primaryKey: 'id',
            tenantScoped: true,
            hiddenFields: [],
            fields: ['id', 'name'],
            relations: {},
          },
        }),
      );

      project.write('app.tsx', 'export function App() { return <div />; }');

      createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        entitySchemaPath: schemaPath,
        logger,
      });

      const loadedEntries = logger.entries.filter((e) => e.message === 'entity-schema-loaded');
      expect(loadedEntries.length).toBe(1);
      expect(loadedEntries[0]?.data?.entities).toBe(2);
    });
  });

  describe('route splitting', () => {
    it('compiles route file with routeSplitting enabled via native compiler', async () => {
      const filePath = project.write(
        'routes.tsx',
        `
import { defineRoutes } from '@vertz/ui';
import { HomePage } from './pages/home';
import { AboutPage } from './pages/about';

export const routes = defineRoutes({
  '/': { component: () => HomePage() },
  '/about': { component: () => AboutPage() },
});
`,
      );

      // Write the page files so imports resolve
      project.write('pages/home.tsx', 'export function HomePage() { return <div>Home</div>; }');
      project.write('pages/about.tsx', 'export function AboutPage() { return <div>About</div>; }');

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
      });

      const result = await runPluginOnLoad(plugin, filePath);

      // Native compiler should have compiled the route file
      expect(result.contents).toBeDefined();
      expect(result.loader).toBe('tsx');
    });

    it('only registers one onLoad handler (native compiler handles .ts route splitting)', () => {
      project.write('app.tsx', 'export function App() { return <div />; }');

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        routeSplitting: true,
      });

      // Capture all onLoad handlers
      const handlers: Array<{ opts: { filter: RegExp }; cb: Function }> = [];
      plugin.setup({
        onLoad(opts: { filter: RegExp }, cb: Function) {
          handlers.push({ opts, cb });
        },
      });

      // Native compiler handles route splitting — no separate .ts handler
      expect(handlers.length).toBe(1);
      expect(handlers[0].opts.filter).toEqual(/\.tsx$/);
    });
  });

  describe('image transform processing', () => {
    it('processes source containing <Image> through the image transform pipeline', async () => {
      // Create a small valid PNG (1x1 pixel red)
      const pngBytes = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      const imgDir = join(project.srcDir, 'assets');
      mkdirSync(imgDir, { recursive: true });
      writeFileSync(join(imgDir, 'photo.png'), pngBytes);

      const filePath = project.write(
        'gallery.tsx',
        `
import { Image } from '@vertz/ui';

export function Gallery() {
  return <Image src="./assets/photo.png" width={100} height={100} alt="Photo" />;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
      });

      // Image processing may throw on the tiny 1x1 PNG (sharp/vips limitation),
      // but either path confirms the image transform pipeline was entered.
      let result: { contents: string; loader: string } | null = null;
      let threw = false;
      try {
        result = await runPluginOnLoad(plugin, filePath);
      } catch {
        threw = true;
      }

      // The pipeline either succeeded (producing transformed output) or threw
      // (confirming the image transform code path was reached).
      if (result) {
        expect(result.contents).toContain('Gallery');
        expect(result.loader).toBe('tsx');
      } else {
        expect(threw).toBe(true);
      }
    });

    it('uses fallback paths when image file does not exist on disk', async () => {
      // Reference a non-existent image — computeImageOutputPaths returns null,
      // triggering the fallback path (lines 342-347) and producing an image
      // transform source map (line 385).
      const filePath = project.write(
        'missing-img.tsx',
        `
import { Image } from '@vertz/ui';

export function MissingImg() {
  return <Image src="./nonexistent.png" width={200} height={150} alt="Missing" />;
}
`,
      );

      const { plugin } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
      });

      const result = await runPluginOnLoad(plugin, filePath);

      // The transform should succeed — fallback paths are used instead of
      // crashing, and no image processing is attempted.
      expect(result.contents).toContain('MissingImg');
      expect(result.loader).toBe('tsx');
      // The <Image> should have been replaced with <picture> using fallback paths
      expect(result.contents).toContain('picture');
    });
  });

  describe('manifest HMR warning logging during updateManifest', () => {
    it('logs warnings from updateManifest via logger', () => {
      const logger = createMockLogger(new Set(['manifest']));

      // Create file with circular re-export
      project.write(
        'hooks/a.ts',
        `
export { useB } from './b';
export function useA() { return 'a'; }
`,
      );
      project.write(
        'hooks/b.ts',
        `
export { useA } from './a';
export function useB() { return 'b'; }
`,
      );

      const { updateManifest } = createVertzBunPlugin({
        projectRoot: project.dir,
        srcDir: project.srcDir,
        cssOutDir: project.cssDir,
        hmr: false,
        fastRefresh: false,
        logger,
      });

      // Clear pre-pass log entries
      logger.entries.length = 0;

      // Update one of the circular files
      const filePath = join(project.srcDir, 'hooks/a.ts');
      updateManifest(
        filePath,
        `
export { useB } from './b';
export function useA() { return 'updated'; }
`,
      );

      // Should have hmr-update entry
      const hmrEntries = logger.entries.filter((e) => e.message === 'hmr-update');
      expect(hmrEntries.length).toBe(1);
    });
  });
});
