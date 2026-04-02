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
      options?: { filename?: string },
    ) => {
      code: string;
    };
  };
}

function compileAndGetCode(source: string): string {
  const { compile } = loadCompiler();
  const result = compile(source, { filename: 'test.tsx' });
  return result.code;
}

describe('Feature: Query auto-thunk transformer', () => {
  describe('Given a query() call with a reactive signal dependency', () => {
    describe('When compiled', () => {
      it('Then wraps the argument in a thunk', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            let page = 1;
            const tasks = query(fetchTasks({ page }));
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).toContain('query(() => fetchTasks(');
      });
    });
  });

  describe('Given a query() call with a computed dependency', () => {
    describe('When compiled', () => {
      it('Then wraps the argument in a thunk', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            let page = 1;
            const offset = (page - 1) * 20;
            const tasks = query(fetchTasks({ offset }));
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).toContain('query(() => fetchTasks(');
      });
    });
  });

  describe('Given a query() call already wrapped in a thunk', () => {
    describe('When compiled', () => {
      it('Then does NOT double-wrap', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            let page = 1;
            const tasks = query(() => fetchTasks({ page }));
            return <div>{tasks.data}</div>;
          }
        `);
        // Should not have () => () =>
        expect(code).not.toContain('() => () =>');
      });
    });
  });

  describe('Given a query() call with no reactive dependencies', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap in a thunk', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            const tasks = query(fetchTasks({ limit: 20 }));
            return <div>{tasks.data}</div>;
          }
        `);
        // Should NOT have () => wrapper
        expect(code).not.toContain('query(() =>');
      });
    });
  });

  describe('Given a query() call with a reactive source (useSearchParams)', () => {
    describe('When compiled', () => {
      it('Then wraps the argument in a thunk', () => {
        const code = compileAndGetCode(`
          import { query, useSearchParams } from '@vertz/ui';
          function TaskList() {
            const sp = useSearchParams();
            const tasks = query(fetchTasks({ page: sp.page }));
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).toContain('query(() => fetchTasks(');
      });
    });
  });

  describe('Given a query() call with options as second argument', () => {
    describe('When compiled', () => {
      it('Then wraps only the first argument, preserving options', () => {
        const code = compileAndGetCode(`
          import { query } from '@vertz/ui';
          function TaskList() {
            let page = 1;
            const tasks = query(fetchTasks({ page }), { key: 'tasks' });
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).toContain('query(() => fetchTasks(');
        expect(code).toContain("{ key: 'tasks' }");
      });
    });
  });

  describe('Given an aliased query import', () => {
    describe('When compiled', () => {
      it('Then wraps the aliased call', () => {
        const code = compileAndGetCode(`
          import { query as q } from '@vertz/ui';
          function TaskList() {
            let page = 1;
            const tasks = q(fetchTasks({ page }));
            return <div>{tasks.data}</div>;
          }
        `);
        expect(code).toContain('q(() => fetchTasks(');
      });
    });
  });

  describe('Given a reactive source declared but NOT referenced in query arg', () => {
    describe('When compiled', () => {
      it('Then does NOT wrap in a thunk', () => {
        const code = compileAndGetCode(`
          import { query, useSearchParams } from '@vertz/ui';
          function TaskList() {
            const sp = useSearchParams();
            const tasks = query(fetchTasks({ limit: 20 }));
            return <div>{tasks.data}{sp.page}</div>;
          }
        `);
        // sp exists but is NOT referenced in the query arg
        expect(code).not.toContain('query(() =>');
      });
    });
  });
});
