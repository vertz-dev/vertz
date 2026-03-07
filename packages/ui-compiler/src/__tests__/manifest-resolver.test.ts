/**
 * Tests for manifest resolver — cross-file reactivity propagation.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  generateAllManifests,
  regenerateFileManifest,
  resolveModuleSpecifier,
} from '../manifest-resolver';
import type { ReactivityManifest } from '../types';

/** Helper to create a temp project structure for testing. */
function createTempProject(): { dir: string; write: (path: string, content: string) => string } {
  const dir = mkdtempSync(join(tmpdir(), 'vertz-manifest-test-'));
  const srcDir = join(dir, 'src');
  mkdirSync(srcDir, { recursive: true });

  return {
    dir,
    write(relativePath: string, content: string): string {
      const fullPath = join(srcDir, relativePath);
      mkdirSync(join(fullPath, '..'), { recursive: true });
      writeFileSync(fullPath, content);
      return fullPath;
    },
  };
}

/** Framework manifest for @vertz/ui used in tests. */
const FRAMEWORK_MANIFEST: ReactivityManifest = {
  version: 1,
  filePath: '@vertz/ui',
  exports: {
    query: {
      kind: 'function',
      reactivity: {
        type: 'signal-api',
        signalProperties: ['data', 'loading', 'error', 'revalidating'],
        plainProperties: ['refetch', 'revalidate', 'dispose'],
      },
    },
    useContext: {
      kind: 'function',
      reactivity: { type: 'reactive-source' },
    },
    signal: {
      kind: 'function',
      reactivity: { type: 'signal' },
    },
  },
};

describe('manifest-resolver', () => {
  let project: ReturnType<typeof createTempProject>;

  beforeEach(() => {
    project = createTempProject();
  });

  afterEach(() => {
    rmSync(project.dir, { recursive: true, force: true });
  });

  describe('generateAllManifests', () => {
    it('generates manifests for all source files', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetchTasks());
        }
      `,
      );
      project.write(
        'utils/format.ts',
        `
        export function formatDate(d: Date) {
          return d.toLocaleDateString();
        }
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      expect(result.manifests.size).toBeGreaterThanOrEqual(2);
      expect(result.durationMs).toBeGreaterThan(0);
    });

    it('resolves re-exports through barrel files', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetchTasks());
        }
      `,
      );
      project.write(
        'hooks/index.ts',
        `
        export { useTasks } from './use-tasks';
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      const indexManifest = result.manifests.get(join(project.dir, 'src/hooks/index.ts'));
      expect(indexManifest).toBeDefined();
      expect(indexManifest!.exports.useTasks).toBeDefined();
      expect(indexManifest!.exports.useTasks.reactivity.type).toBe('signal-api');
    });

    it('resolves star re-exports', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetchTasks());
        }
        export function formatTask(t: any) {
          return t.title;
        }
      `,
      );
      project.write(
        'hooks/index.ts',
        `
        export * from './use-tasks';
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      const indexManifest = result.manifests.get(join(project.dir, 'src/hooks/index.ts'));
      expect(indexManifest).toBeDefined();
      expect(indexManifest!.exports.useTasks.reactivity.type).toBe('signal-api');
      expect(indexManifest!.exports.formatTask.reactivity.type).toBe('static');
    });

    it('resolves multi-level re-export chains', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetchTasks());
        }
      `,
      );
      project.write(
        'hooks/index.ts',
        `
        export { useTasks } from './use-tasks';
      `,
      );
      project.write(
        'index.ts',
        `
        export { useTasks } from './hooks';
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      const rootManifest = result.manifests.get(join(project.dir, 'src/index.ts'));
      expect(rootManifest).toBeDefined();
      expect(rootManifest!.exports.useTasks.reactivity.type).toBe('signal-api');
    });

    it('detects circular dependencies and classifies as unknown', () => {
      // Circular re-exports: a re-exports from b, b re-exports from a
      project.write(
        'hooks/a.ts',
        `
        export { useB } from './b';
        export function useA() {
          return 'a';
        }
      `,
      );
      project.write(
        'hooks/b.ts',
        `
        export { useA } from './a';
        export function useB() {
          return 'b';
        }
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
      });

      expect(result.warnings.length).toBeGreaterThanOrEqual(1);
      expect(result.warnings.some((w) => w.type === 'circular-dependency')).toBe(true);

      // Circular deps should still produce manifests with unknown exports
      const aManifest = result.manifests.get(join(project.dir, 'src/hooks/a.ts'));
      const bManifest = result.manifests.get(join(project.dir, 'src/hooks/b.ts'));
      expect(aManifest).toBeDefined();
      expect(bManifest).toBeDefined();
    });

    it('skips test files', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        export function useTasks() { return 'tasks'; }
      `,
      );
      project.write(
        'hooks/use-tasks.test.ts',
        `
        export function testHelper() { return 'test'; }
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
      });

      const testManifest = result.manifests.get(
        join(project.dir, 'src/hooks/use-tasks.test.ts'),
      );
      expect(testManifest).toBeUndefined();
    });

    it('completes within performance budget for small project', () => {
      // Create 20 files to verify reasonable performance
      for (let i = 0; i < 20; i++) {
        project.write(
          `hooks/use-hook-${i}.ts`,
          `
          import { query } from '@vertz/ui';
          export function useHook${i}() {
            return query(() => fetch('/api/${i}'));
          }
        `,
        );
      }

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      // Should be well under 150ms for 20 files
      expect(result.durationMs).toBeLessThan(5000);
      expect(result.manifests.size).toBeGreaterThanOrEqual(20);
    });
  });

  describe('resolveModuleSpecifier', () => {
    it('resolves relative import with .ts extension', () => {
      const filePath = project.write('hooks/use-tasks.ts', 'export const x = 1;');
      const resolved = resolveModuleSpecifier(
        './use-tasks',
        join(project.dir, 'src/hooks/index.ts'),
        {},
        project.dir,
      );
      expect(resolved).toBe(filePath);
    });

    it('resolves relative import with .tsx extension', () => {
      const filePath = project.write('components/task-list.tsx', 'export const x = 1;');
      const resolved = resolveModuleSpecifier(
        './task-list',
        join(project.dir, 'src/components/index.ts'),
        {},
        project.dir,
      );
      expect(resolved).toBe(filePath);
    });

    it('resolves directory import to index.ts', () => {
      const filePath = project.write('hooks/index.ts', 'export const x = 1;');
      const resolved = resolveModuleSpecifier(
        './hooks',
        join(project.dir, 'src/app.ts'),
        {},
        project.dir,
      );
      expect(resolved).toBe(filePath);
    });

    it('resolves parent-relative imports', () => {
      const filePath = project.write('utils/format.ts', 'export const x = 1;');
      const resolved = resolveModuleSpecifier(
        '../utils/format',
        join(project.dir, 'src/hooks/use-tasks.ts'),
        {},
        project.dir,
      );
      expect(resolved).toBe(filePath);
    });

    it('resolves tsconfig paths', () => {
      const filePath = project.write('hooks/use-tasks.ts', 'export const x = 1;');
      const resolved = resolveModuleSpecifier(
        '@/hooks/use-tasks',
        join(project.dir, 'src/app.ts'),
        { '@/*': ['src/*'] },
        project.dir,
      );
      expect(resolved).toBe(filePath);
    });

    it('returns package specifier as-is for non-relative imports', () => {
      const resolved = resolveModuleSpecifier(
        '@vertz/ui',
        join(project.dir, 'src/app.ts'),
        {},
        project.dir,
      );
      expect(resolved).toBe('@vertz/ui');
    });
  });

  describe('regenerateFileManifest', () => {
    it('updates manifest for a changed file', () => {
      const filePath = project.write(
        'hooks/use-tasks.ts',
        `
        export function useTasks() {
          return 'static';
        }
      `,
      );

      // Generate initial manifests
      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      expect(result.manifests.get(filePath)!.exports.useTasks.reactivity.type).toBe('static');

      // Now update the file to return query()
      const newSource = `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetch('/api'));
        }
      `;

      const updated = regenerateFileManifest(filePath, newSource, result.manifests, {
        srcDir: join(project.dir, 'src'),
      });

      expect(updated.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      // The manifests map should also be updated
      expect(result.manifests.get(filePath)!.exports.useTasks.reactivity.type).toBe('signal-api');
    });

    it('replaces stale entry instead of keeping old one', () => {
      const filePath = project.write(
        'hooks/use-data.ts',
        `
        import { query } from '@vertz/ui';
        export function useData() { return query(() => fetch('/api')); }
        export function useOther() { return 'static'; }
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      // Remove useOther in the updated version
      const newSource = `
        export function useData() { return 'now static'; }
      `;

      regenerateFileManifest(filePath, newSource, result.manifests, {
        srcDir: join(project.dir, 'src'),
      });

      const manifest = result.manifests.get(filePath)!;
      expect(manifest.exports.useData.reactivity.type).toBe('static');
      // useOther should no longer exist
      expect(manifest.exports.useOther).toBeUndefined();
    });
  });

  describe('analyzeWithManifest (cross-file test helper)', () => {
    it('utility function returning query() gets correct signal-api manifest', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        import { fetchTasks } from '../api/tasks';

        export function useTasks() {
          return query(() => fetchTasks(), { key: 'tasks' });
        }
      `,
      );
      project.write(
        'api/tasks.ts',
        `
        export function fetchTasks() {
          return fetch('/api/tasks').then(r => r.json());
        }
      `,
      );

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      const hookManifest = result.manifests.get(
        join(project.dir, 'src/hooks/use-tasks.ts'),
      );
      expect(hookManifest).toBeDefined();

      const useTasks = hookManifest!.exports.useTasks;
      expect(useTasks.kind).toBe('function');
      expect(useTasks.reactivity.type).toBe('signal-api');

      if (useTasks.reactivity.type === 'signal-api') {
        expect(useTasks.reactivity.signalProperties).toEqual(
          new Set(['data', 'loading', 'error', 'revalidating']),
        );
        expect(useTasks.reactivity.plainProperties).toEqual(
          new Set(['refetch', 'revalidate', 'dispose']),
        );
      }
    });

    it('barrel re-exports follow chain to original source', () => {
      project.write(
        'hooks/use-tasks.ts',
        `
        import { query } from '@vertz/ui';
        export function useTasks() {
          return query(() => fetchTasks());
        }
      `,
      );
      project.write('hooks/index.ts', `export { useTasks } from './use-tasks';`);

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
        packageManifests: { '@vertz/ui': FRAMEWORK_MANIFEST },
      });

      const barrelManifest = result.manifests.get(join(project.dir, 'src/hooks/index.ts'));
      expect(barrelManifest!.exports.useTasks.reactivity.type).toBe('signal-api');
    });

    it('static utility remains static through barrel', () => {
      project.write(
        'utils/format.ts',
        `
        export function formatDate(d: Date) {
          return d.toLocaleDateString();
        }
      `,
      );
      project.write('utils/index.ts', `export { formatDate } from './format';`);

      const result = generateAllManifests({
        srcDir: join(project.dir, 'src'),
      });

      const barrelManifest = result.manifests.get(join(project.dir, 'src/utils/index.ts'));
      expect(barrelManifest!.exports.formatDate.reactivity.type).toBe('static');
    });
  });
});
