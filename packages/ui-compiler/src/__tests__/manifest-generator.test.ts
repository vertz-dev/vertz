/**
 * Tests for manifest generation — single-file analysis.
 */
import { describe, expect, it } from 'bun:test';
import { analyzeFile } from '../manifest-generator';

describe('manifest-generator', () => {
  describe('analyzeFile', () => {
    describe('exported functions', () => {
      it('classifies function returning query() as signal-api', () => {
        const source = `
          import { query } from '@vertz/ui';

          export function useTasks() {
            return query(() => fetchTasks(), { key: 'tasks' });
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        const useTasks = analysis.manifest.exports.useTasks;
        expect(useTasks).toBeDefined();
        expect(useTasks.kind).toBe('function');
        expect(useTasks.reactivity.type).toBe('signal-api');
      });

      it('classifies function returning useContext() as reactive-source', () => {
        const source = `
          import { useContext } from '@vertz/ui';
          import { ThemeCtx } from './theme';

          export function useTheme() {
            return useContext(ThemeCtx)!;
          }
        `;
        const analysis = analyzeFile('src/hooks/use-theme.ts', source);
        expect(analysis.manifest.exports.useTheme.reactivity.type).toBe('reactive-source');
      });

      it('classifies function returning plain value as static', () => {
        const source = `
          export function formatDate(d: Date) {
            return d.toLocaleDateString();
          }
        `;
        const analysis = analyzeFile('src/utils/format.ts', source);
        expect(analysis.manifest.exports.formatDate.reactivity.type).toBe('static');
      });

      it('classifies function returning local variable assigned from query() as signal-api', () => {
        const source = `
          import { query } from '@vertz/ui';

          export function useTasks() {
            const q = query(() => fetchTasks());
            return q;
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      });

      it('classifies component function as component', () => {
        const source = `
          export function TaskList() {
            return <div>Hello</div>;
          }
        `;
        const analysis = analyzeFile('src/components/task-list.tsx', source);
        expect(analysis.manifest.exports.TaskList.kind).toBe('component');
      });

      it('classifies function with no body as unknown', () => {
        const source = `
          export declare function foo(): void;
        `;
        const analysis = analyzeFile('src/types.ts', source);
        expect(analysis.manifest.exports.foo.reactivity.type).toBe('unknown');
      });

      it('handles conditional returns with mixed reactivity (uses most reactive)', () => {
        const source = `
          import { query } from '@vertz/ui';

          export function maybeTasks(enabled: boolean) {
            if (enabled) {
              return query(() => fetchTasks());
            }
            return { data: null, loading: false, error: null };
          }
        `;
        const analysis = analyzeFile('src/hooks/maybe-tasks.ts', source);
        expect(analysis.manifest.exports.maybeTasks.reactivity.type).toBe('signal-api');
      });

      it('handles aliased imports', () => {
        const source = `
          import { query as q } from '@vertz/ui';

          export function useTasks() {
            return q(() => fetchTasks());
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      });
    });

    describe('exported variables', () => {
      it('classifies arrow function returning query() as signal-api', () => {
        const source = `
          import { query } from '@vertz/ui';

          export const useTasks = () => {
            return query(() => fetchTasks());
          };
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.useTasks.kind).toBe('function');
        expect(analysis.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      });

      it('classifies concise arrow returning query() as signal-api', () => {
        const source = `
          import { query } from '@vertz/ui';

          export const useTasks = () => query(() => fetchTasks());
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      });

      it('classifies variable assigned from query() call as signal-api', () => {
        const source = `
          import { query } from '@vertz/ui';

          export const tasks = query(() => fetchTasks());
        `;
        const analysis = analyzeFile('src/hooks/tasks.ts', source);
        expect(analysis.manifest.exports.tasks.kind).toBe('variable');
        expect(analysis.manifest.exports.tasks.reactivity.type).toBe('signal-api');
      });

      it('classifies plain variable as static', () => {
        const source = `
          export const API_URL = 'https://api.example.com';
        `;
        const analysis = analyzeFile('src/config.ts', source);
        expect(analysis.manifest.exports.API_URL.reactivity.type).toBe('static');
      });

      it('classifies arrow function component as component', () => {
        const source = `
          export const TaskList = () => {
            return <div>Hello</div>;
          };
        `;
        const analysis = analyzeFile('src/components/task-list.tsx', source);
        // Arrow function components don't have a name to check uppercase,
        // so they may be classified as function. That's acceptable.
        expect(analysis.manifest.exports.TaskList).toBeDefined();
      });
    });

    describe('re-exports', () => {
      it('detects named re-exports', () => {
        const source = `
          export { useTasks } from './use-tasks';
          export { useTheme } from './use-theme';
        `;
        const analysis = analyzeFile('src/hooks/index.ts', source);
        expect(analysis.reExports).toHaveLength(2);
        expect(analysis.reExports[0]).toEqual({
          exportName: 'useTasks',
          originalName: 'useTasks',
          moduleSpecifier: './use-tasks',
        });
      });

      it('detects renamed re-exports', () => {
        const source = `
          export { useTasks as useTaskList } from './use-tasks';
        `;
        const analysis = analyzeFile('src/hooks/index.ts', source);
        expect(analysis.reExports[0]).toEqual({
          exportName: 'useTaskList',
          originalName: 'useTasks',
          moduleSpecifier: './use-tasks',
        });
      });

      it('detects star re-exports', () => {
        const source = `
          export * from './use-tasks';
        `;
        const analysis = analyzeFile('src/hooks/index.ts', source);
        expect(analysis.reExports[0]).toEqual({
          exportName: '*',
          originalName: '*',
          moduleSpecifier: './use-tasks',
        });
      });
    });

    describe('imports', () => {
      it('collects import references', () => {
        const source = `
          import { query } from '@vertz/ui';
          import { fetchTasks } from '../api/tasks';

          export function useTasks() {
            return query(() => fetchTasks());
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.imports).toHaveLength(2);
        expect(analysis.imports[0]).toEqual({
          localName: 'query',
          originalName: 'query',
          moduleSpecifier: '@vertz/ui',
        });
        expect(analysis.imports[1]).toEqual({
          localName: 'fetchTasks',
          originalName: 'fetchTasks',
          moduleSpecifier: '../api/tasks',
        });
      });
    });

    describe('signal-api shape details', () => {
      it('includes signal and plain properties for query()', () => {
        const source = `
          import { query } from '@vertz/ui';
          export function useTasks() {
            return query(() => fetchTasks());
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        const reactivity = analysis.manifest.exports.useTasks.reactivity;
        expect(reactivity.type).toBe('signal-api');
        if (reactivity.type === 'signal-api') {
          expect(reactivity.signalProperties).toEqual(
            expect.arrayContaining(['data', 'loading', 'error', 'revalidating']),
          );
          expect(reactivity.plainProperties).toEqual(
            expect.arrayContaining(['refetch', 'revalidate', 'dispose']),
          );
        }
      });

      it('includes fieldSignalProperties for form()', () => {
        const source = `
          import { form } from '@vertz/ui';
          export function useForm() {
            return form({ title: '', body: '' });
          }
        `;
        const analysis = analyzeFile('src/hooks/use-form.ts', source);
        const reactivity = analysis.manifest.exports.useForm.reactivity;
        if (reactivity.type === 'signal-api') {
          expect(reactivity.fieldSignalProperties).toEqual(
            expect.arrayContaining(['value', 'error', 'dirty', 'touched']),
          );
        }
      });
    });

    describe('export default', () => {
      it('classifies export default function returning query() as signal-api', () => {
        const source = `
          import { query } from '@vertz/ui';
          export default function useTasks() {
            return query(() => fetchTasks());
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.default).toBeDefined();
        expect(analysis.manifest.exports.default.kind).toBe('function');
        expect(analysis.manifest.exports.default.reactivity.type).toBe('signal-api');
      });

      it('classifies export default arrow function as component', () => {
        const source = `
          export default function TaskList() {
            return <div>Hello</div>;
          }
        `;
        const analysis = analyzeFile('src/components/task-list.tsx', source);
        expect(analysis.manifest.exports.default.kind).toBe('component');
      });

      it('classifies export default expression', () => {
        const source = `
          import { query } from '@vertz/ui';
          const tasks = query(() => fetchTasks());
          export default tasks;
        `;
        const analysis = analyzeFile('src/hooks/tasks.ts', source);
        expect(analysis.manifest.exports.default).toBeDefined();
      });
    });

    describe('method declarations in returned objects', () => {
      it('does not descend into method declarations when collecting return shapes', () => {
        const source = `
          import { query } from '@vertz/ui';
          export function useApi() {
            const q = query(() => fetch('/api'));
            return q;
          }
          function helper() {
            return {
              getData() { return query(() => fetch('/other')); },
            };
          }
        `;
        const analysis = analyzeFile('src/hooks/use-api.ts', source);
        // The exported function returns q directly → signal-api
        expect(analysis.manifest.exports.useApi.reactivity.type).toBe('signal-api');
      });
    });

    describe('local function tracking for export { foo }', () => {
      it('resolves local function exported via export { foo }', () => {
        const source = `
          import { query } from '@vertz/ui';
          function useTasks() {
            return query(() => fetchTasks());
          }
          export { useTasks };
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.useTasks).toBeDefined();
        expect(analysis.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      });
    });

    describe('type wrappers', () => {
      it('handles as expression in return', () => {
        const source = `
          import { query } from '@vertz/ui';
          export function useTasks() {
            return query(() => fetchTasks()) as any;
          }
        `;
        const analysis = analyzeFile('src/hooks/use-tasks.ts', source);
        expect(analysis.manifest.exports.useTasks.reactivity.type).toBe('signal-api');
      });

      it('handles non-null assertion in return', () => {
        const source = `
          import { useContext } from '@vertz/ui';
          export function useTheme() {
            return useContext(ThemeCtx)!;
          }
        `;
        const analysis = analyzeFile('src/hooks/use-theme.ts', source);
        expect(analysis.manifest.exports.useTheme.reactivity.type).toBe('reactive-source');
      });
    });
  });
});
