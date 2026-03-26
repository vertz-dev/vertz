import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';

const NATIVE_MODULE_PATH = join(
  import.meta.dir,
  '..',
  'vertz-compiler.darwin-arm64.node',
);

function loadCompiler() {
  return require(NATIVE_MODULE_PATH) as {
    compile: (
      source: string,
      options?: {
        filename?: string;
        manifests?: Array<{
          moduleSpecifier: string;
          exportName: string;
          reactivityType: string;
          signalProperties?: string[];
          plainProperties?: string[];
          fieldSignalProperties?: string[];
        }>;
      },
    ) => {
      code: string;
    };
  };
}

describe('Feature: Cross-file reactivity manifest', () => {
  describe('Given a custom hook returning signal-api properties via manifest', () => {
    describe('When compiled with manifest data', () => {
      it('Then unwraps .value on signal properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { useTaskStore } from './stores';
          function TaskList() {
            const store = useTaskStore();
            const hasError = store.error ? true : false;
            return <div>{hasError}</div>;
          }
        `;
        const result = compile(source, {
          filename: 'test.tsx',
          manifests: [
            {
              moduleSpecifier: './stores',
              exportName: 'useTaskStore',
              reactivityType: 'signal-api',
              signalProperties: ['data', 'loading', 'error'],
              plainProperties: ['refetch'],
            },
          ],
        });
        expect(result.code).toContain('store.error.value');
      });

      it('Then does NOT unwrap .value on plain properties', () => {
        const { compile } = loadCompiler();
        const source = `
          import { useTaskStore } from './stores';
          function TaskList() {
            const store = useTaskStore();
            const handler = () => store.refetch();
            return <div>{store.data}</div>;
          }
        `;
        const result = compile(source, {
          filename: 'test.tsx',
          manifests: [
            {
              moduleSpecifier: './stores',
              exportName: 'useTaskStore',
              reactivityType: 'signal-api',
              signalProperties: ['data', 'loading', 'error'],
              plainProperties: ['refetch'],
            },
          ],
        });
        expect(result.code).not.toContain('store.refetch.value');
        expect(result.code).toContain('store.data.value');
      });
    });
  });

  describe('Given a custom hook returning reactive-source properties via manifest', () => {
    describe('When compiled with manifest data', () => {
      it('Then marks the variable as a reactive source', () => {
        const { compile } = loadCompiler();
        const source = `
          import { query } from '@vertz/ui';
          import { useFilters } from './hooks';
          function TaskList() {
            const filters = useFilters();
            const tasks = query(fetchTasks({ status: filters.status }));
            return <div>{tasks.data}</div>;
          }
        `;
        const result = compile(source, {
          filename: 'test.tsx',
          manifests: [
            {
              moduleSpecifier: './hooks',
              exportName: 'useFilters',
              reactivityType: 'reactive-source',
            },
          ],
        });
        // reactive source in query arg should trigger auto-thunk
        expect(result.code).toContain('query(() => fetchTasks(');
      });
    });
  });

  describe('Given a custom hook with field signal properties via manifest', () => {
    describe('When compiled with manifest data', () => {
      it('Then unwraps .value on 3-level field chains', () => {
        const { compile } = loadCompiler();
        const source = `
          import { useTaskForm } from './forms';
          function CreateTask() {
            const taskForm = useTaskForm();
            const titleError = taskForm.title.error;
            return <div>{titleError}</div>;
          }
        `;
        const result = compile(source, {
          filename: 'test.tsx',
          manifests: [
            {
              moduleSpecifier: './forms',
              exportName: 'useTaskForm',
              reactivityType: 'signal-api',
              signalProperties: ['submitting', 'dirty'],
              plainProperties: ['action', 'onSubmit'],
              fieldSignalProperties: ['value', 'error', 'dirty'],
            },
          ],
        });
        expect(result.code).toContain('taskForm.title.error.value');
      });
    });
  });

  describe('Given no manifests provided', () => {
    describe('When compiled with an unknown custom hook', () => {
      it('Then does NOT unwrap .value (no cross-file info)', () => {
        const { compile } = loadCompiler();
        const source = `
          import { useTaskStore } from './stores';
          function TaskList() {
            const store = useTaskStore();
            const hasError = store.error ? true : false;
            return <div>{hasError}</div>;
          }
        `;
        const result = compile(source, { filename: 'test.tsx' });
        expect(result.code).not.toContain('store.error.value');
      });
    });
  });
});
